#!/usr/bin/env python3
"""Render an excerpt of the soundtrack with the beat map ticking over it.

The only honest test of a beat map is listening to it. Everything the analyser
reports about itself - residuals, support, coverage - is a statement about its
own model; a click that lands next to the kick instead of on it is audible in
two seconds and invisible in any of those numbers.

  tools/verify_beats.py --at 1200 --dur 20
  tools/verify_beats.py --at 1200 --dur 20 --clicks-only   # is the GRID right
  tools/verify_beats.py --spread 8                         # 8 excerpts, spread

Downbeats get a higher click, so a bar that has drifted onto the wrong beat is
audible as well as a grid that has drifted off the pulse entirely.
"""

import argparse, json, os, subprocess, sys
import numpy as np

SR = 44100


def beats_between(doc, t0, t1):
    """Every beat the map places in [t0, t1), with its position in the bar."""
    out = []
    for s in doc['segments']:
        if s['t1'] <= t0 or s['t0'] >= t1:
            continue
        if s['quantized']:
            p, a = s['period'], s['anchor'] + doc.get('offset', 0.0)
            bpb = s.get('beatsPerBar', 4)
            n = int(np.ceil((max(t0, s['t0']) - a) / p))
            while True:
                t = a + n * p
                if t >= min(t1, s['t1']):
                    break
                out.append((t, n % bpb == s.get('barOffset', 0)))
                n += 1
        else:
            for t in s['beats']:
                t += doc.get('offset', 0.0)
                if t0 <= t < t1:
                    out.append((t, False))
    out.sort()
    return out


def click(freq, n=int(0.035 * SR)):
    t = np.arange(n) / SR
    return (np.sin(2 * np.pi * freq * t) * np.exp(-t * 90.0)).astype(np.float32)


def render(src, doc, at, dur, out, clicks_only, gain):
    import soundfile as sf
    raw = out + '.src.wav'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', str(at), '-t', str(dur),
                    '-i', src, '-ac', '2', '-ar', str(SR), raw], check=True)
    y, _ = sf.read(raw, dtype='float32')
    os.remove(raw)
    if clicks_only:
        y = np.zeros_like(y)
    else:
        y *= 0.45

    lo, hi = click(1000.0), click(2000.0)
    for t, down in beats_between(doc, at, at + dur):
        i = int((t - at) * SR)
        c = hi if down else lo
        j = min(len(y), i + len(c))
        if i < 0 or j <= i:
            continue
        y[i:j] += (c[:j - i] * gain)[:, None]

    sf.write(out, np.clip(y, -1, 1), SR)
    return out


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', default='assets/audio/soundtrack.m4a')
    ap.add_argument('--map', default='assets/audio/soundtrack.beats.json')
    ap.add_argument('--out-dir', default=os.environ.get('BEAT_SCRATCH', '/tmp'))
    ap.add_argument('--at', type=float, default=None, help='seconds into the track')
    ap.add_argument('--dur', type=float, default=20.0)
    ap.add_argument('--spread', type=int, default=0,
                    help='render N excerpts evenly across the whole file instead')
    ap.add_argument('--clicks-only', action='store_true',
                    help='mute the music; checks the grid is even, not that it fits')
    ap.add_argument('--gain', type=float, default=0.5)
    a = ap.parse_args()

    doc = json.load(open(a.map))
    ats = []
    if a.spread:
        ats = list(np.linspace(0, doc['duration'] - a.dur, a.spread))
    elif a.at is not None:
        ats = [a.at]
    else:
        ap.error('pass --at or --spread')

    for t in ats:
        out = os.path.join(a.out_dir, f'beatcheck-{int(t):05d}.wav')
        render(a.src, doc, float(t), a.dur, out, a.clicks_only, a.gain)
        seg = next((s for s in doc['segments'] if s['t0'] <= t < s['t1']), None)
        tag = (f"{seg['bpm']:.2f} BPM, jitter {seg['jitterMs']}ms"
               if seg and seg['quantized'] else 'raw segment')
        print(f'{out}   t={t:.0f}s   {tag}')
