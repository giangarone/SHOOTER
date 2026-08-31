#!/usr/bin/env python3
"""Offline beat analysis for the soundtrack -> assets/audio/beatmap.json.

WHAT COMES OUT: the timeline cut into segments, each holding a CONSTANT-TEMPO
BEAT GRID (an anchor time and a period) rather than a list of beat times.

WHY A GRID. A beat tracker's output jitters by several milliseconds even where
it is right, and the game reads the result every frame, so that jitter is
visible as lights that land slightly off. Inside one song the true beats are
almost exactly periodic, so fitting a line through the tracked beats and
shipping the line removes the jitter, and at runtime it costs two floats and a
division instead of a search. Where a line does NOT fit - a transition, a tempo
ramp, a section with no steady pulse - the segment keeps the raw tracked times
instead, which is what `quantized: false` means.

WHY SEGMENT ON RESIDUAL, NOT ON TEMPO. This soundtrack sits between 145.4 and
146.0 BPM for its whole three hours, so a tempo-change detector finds almost
nothing to cut on - and yet a single line across 300 seconds can be 170 ms out
by the end of it, because the songs underneath change phase where they cross
over even when they agree about tempo. Fitting first and splitting where the
fit fails finds those seams; watching the tempo does not.

PIPELINE
  1. decode to mono 22.05k (ffmpeg; the wav is cached in the scratch dir)
  2. spectral-flux onset envelope for the whole file, in chunks, cached
  3. dynamic-programming beat tracking over that envelope, in chunks
  4. recursive split of the beat sequence wherever a line stops fitting
  5. per segment: least-squares period+anchor, quality gate, downbeat phase

Run:  tools/analyze_beats.py --scratch <dir>
      tools/analyze_beats.py --report          # print an existing map
"""

import argparse, json, os, subprocess, sys
import numpy as np

SR = 22050
N_FFT = 1024
HOP = 128                      # 5.8 ms frames - fine enough to place a kick
N_MELS = 48
FMAX = 8000
FRAME_SEC = HOP / SR
# The window is centred on its samples, so a frame reports energy centred half
# a window after the frame's first sample.
FRAME_OFFSET = (N_FFT / 2) / SR

# The kick's range. Its own onset envelope is kept alongside the full-spectrum
# one for two jobs the full one is bad at: weighting the tracker towards the
# kick rather than the hats, and telling which beat of four is the downbeat.
LOW_HZ = 250.0
# How much the low band is worth relative to the full spectrum when the two are
# summed for tracking. At 1.0 the kick roughly doubles in weight, which was the
# difference between a 27 ms line fit and a 165 ms one on the test windows.
LOW_WEIGHT = 1.0

# Beat tracking. High tightness holds the tracker to a near-constant tempo -
# correct for this material, and it is what makes the line fits tight enough to
# be worth quantizing at all. Real tempo changes are not lost to it, because a
# segment that the tracker got wrong fails the fit and gets split.
TIGHTNESS = 400
TRACK_CHUNK = 300.0            # seconds of audio per tracker run
TRACK_OVERLAP = 20.0           # discarded at each seam, where the DP is cold

# A line is accepted as a grid when 95% of the segment's beats sit this close
# to it. 20 ms is under the threshold at which a light reads as late.
FIT_TOL = 0.020
# Never cut below this many beats: a line through a handful of points fits
# whatever it likes and means nothing.
MIN_BEATS = 24
# Two adjacent grids this close in tempo are worth trying to merge back into
# one, which keeps a single song from arriving as five segments.
MERGE_TOL = 0.0008

# A grid also has to sit ON something. `support` is the onset energy at the
# grid's beats over the energy half a beat off them. It is a FLOOR, not a
# quality score: this soundtrack runs continuous sixteenth-note onsets, so the
# offbeat is nearly as loud as the beat and even a perfect grid only scores
# just over 1. Below 1 the grid is genuinely sitting in the gaps.
MIN_SUPPORT = 1.0


def decode(src, cache):
    if not os.path.exists(cache):
        print(f'decoding {src}', flush=True)
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src,
                        '-ac', '1', '-ar', str(SR), '-c:a', 'pcm_s16le', cache],
                       check=True)
    return cache


def onset_envelope(wav, cache):
    """Full-spectrum and low-band onset strength for the whole file.

    Chunked, because a mel spectrogram of three hours at this resolution is
    hundreds of megabytes. Chunks are cut on exact frame boundaries and each
    re-reads the frame before its start, so the flux across a seam is computed
    from real audio rather than against a zero.

    The dB conversion uses a FIXED floor rather than a per-chunk reference: a
    reference taken per chunk would scale each chunk differently and put a step
    in the envelope at every seam.
    """
    if os.path.exists(cache):
        d = np.load(cache)
        return d['full'], d['low'], float(d['duration'])

    import soundfile as sf
    import librosa

    n_samples = sf.info(wav).frames
    n_frames = 1 + (n_samples - N_FFT) // HOP
    mel_f = librosa.mel_frequencies(n_mels=N_MELS, fmin=0.0, fmax=FMAX)
    low_mask = mel_f < LOW_HZ

    full = np.zeros(n_frames, dtype=np.float32)
    low = np.zeros(n_frames, dtype=np.float32)

    step = int(60.0 / FRAME_SEC)
    f = 0
    while f < n_frames:
        f1 = min(n_frames, f + step)
        f0 = max(0, f - 1)
        y, _ = sf.read(wav, start=f0 * HOP, stop=(f1 - 1) * HOP + N_FFT, dtype='float32')
        S = librosa.feature.melspectrogram(y=y, sr=SR, n_fft=N_FFT, hop_length=HOP,
                                           center=False, n_mels=N_MELS, fmax=FMAX)
        D = 10.0 * np.log10(np.maximum(S, 1e-8))
        d = np.diff(D, axis=1)
        np.maximum(d, 0.0, out=d)          # a decay is not an onset
        take = slice(f - f0 - 1, f1 - f0 - 1)
        full[f:f1] = d.mean(axis=0)[take]
        low[f:f1] = d[low_mask].mean(axis=0)[take]
        f = f1
        print(f'  onset envelope {100 * f / n_frames:5.1f}%', end='\r', flush=True)
    print(' ' * 40, end='\r')
    duration = n_samples / SR
    np.savez_compressed(cache, full=full, low=low, duration=duration)
    return full, low, duration


# Length of one tempo-estimation window. Short on purpose: the estimate below
# only works while the tempo holds still, and over a whole 300s chunk a drift
# of a third of a percent is already enough to smear the answer into noise.
TEMPO_WIN = 20.0
# The envelope is decimated by this before the estimate; tempo lives in
# seconds, not in milliseconds.
DECIM = 4


def estimate_tempo(oe):
    """Tempo of one chunk, by Fourier comb over short windows of its envelope.

    In each window every frame contributes a unit vector at angle -2*pi*t/p,
    weighted by its onset strength: at the right period the beats' vectors all
    point the same way and the sum is large, at a wrong one they cancel. One
    complex sum per candidate period, and the median across windows.

    This exists because librosa's own estimator builds a full per-frame
    tempogram - a windowed autocorrelation at every frame of every chunk - and
    over three hours that is twenty minutes and three gigabytes, for a number
    the tracker only needs as a starting point.
    """
    bpm = np.exp(np.linspace(np.log(60.0), np.log(200.0), 2000))
    per = 60.0 / bpm
    span = int(TEMPO_WIN / (FRAME_SEC * DECIM))
    picks = []
    for s in range(0, max(1, len(oe) - span // 2), span):
        seg = oe[s:s + span].astype(np.float64)
        if len(seg) < span // 2:
            break
        w = np.maximum(seg - np.median(seg), 0.0)
        if w.sum() <= 0:
            continue
        t = np.arange(len(seg), dtype=np.float64) * FRAME_SEC * DECIM
        ang = -2j * np.pi * t
        best, best_bpm = -1.0, None
        block = max(1, int(4e6 // max(1, len(t))))
        for i in range(0, len(per), block):
            p = per[i:i + block]
            sc = np.abs(np.exp(ang[None, :] / p[:, None]) @ w)
            j = int(np.argmax(sc))
            if sc[j] > best:
                best, best_bpm = float(sc[j]), float(60.0 / p[j])
        if best_bpm:
            picks.append(best_bpm)
    if not picks:
        return 120.0
    # Octave-fold before taking the median, or a window that reported half time
    # drags the median down between two that did not.
    folded = []
    for b in picks:
        while b < 85.0:
            b *= 2
        while b > 176.0:
            b /= 2
        folded.append(b)
    return float(np.median(folded))


def track_beats(env, duration):
    """Dynamic-programming beat tracking across the whole file.

    Run in chunks with an overlap that is thrown away: the DP has no history at
    a chunk's first beats and no future at its last, so those are the ones it
    gets wrong. Each chunk gets its own tempo prior, which is what lets the
    tempo move between songs even at this tightness.
    """
    import librosa

    spans = []
    start = 0.0
    while start < duration:
        end = min(duration, start + TRACK_CHUNK)
        f0, f1 = int(start * SR / HOP), int(end * SR / HOP)
        if f1 - f0 < SR / HOP * 5:
            break
        spans.append((start, end, f0, f1))
        if end >= duration:
            break
        start = end - TRACK_OVERLAP

    # PASS ONE: a tempo for each chunk. Decimated first - tempo is a property
    # of seconds, not of milliseconds, and this is DECIM times less work for
    # the same answer.
    priors = np.array([estimate_tempo(env[f0:f1:DECIM]) for _, _, f0, f1 in spans])
    # Median-filtered across neighbours. A chunk whose estimate lands on a
    # subdivision or on a passage with no clear pulse would otherwise hand the
    # tracker a tempo that is simply wrong, and the tracker will not argue with
    # it. Its neighbours are the best evidence available about what it should
    # have said, and a median ignores the outlier rather than averaging it in.
    smooth = np.array([np.median(priors[max(0, i - 2):i + 3]) for i in range(len(priors))])
    bad = int(np.sum(np.abs(smooth - priors) / priors > 0.02))
    print(f'  chunk tempo {priors.min():.2f}..{priors.max():.2f} BPM '
          f'(median {np.median(priors):.2f}, {bad} replaced by neighbours)', flush=True)

    # PASS TWO: the tracking itself.
    beats = []
    for i, (start, end, f0, f1) in enumerate(spans):
        # `bpm=` rather than `start_bpm=`: passing it explicitly is what stops
        # librosa estimating the tempo itself, which is the expensive path.
        _, bf = librosa.beat.beat_track(onset_envelope=env[f0:f1], sr=SR, hop_length=HOP,
                                        bpm=float(smooth[i]), tightness=TIGHTNESS,
                                        units='frames', trim=False)
        t = bf * FRAME_SEC + start
        lo = start if start == 0.0 else start + TRACK_OVERLAP * 0.5
        hi = end if end >= duration else end - TRACK_OVERLAP * 0.5
        beats.append(t[(t >= lo) & (t < hi)])
        print(f'  tracking {100 * end / duration:5.1f}%', end='\r', flush=True)
    print(' ' * 40, end='\r')
    b = np.concatenate(beats) if beats else np.zeros(0)
    b.sort()
    # A seam can leave two beats almost on top of each other; keep the first.
    if len(b):
        b = b[np.concatenate(([True], np.diff(b) > 0.15))]
    return b


def fit_line(bt):
    """Least-squares period and anchor for one run of tracked beats.

    The beat's INDEX is re-derived each iteration instead of being its position
    in the list, and that is the whole trick. A tracker drops beats - through a
    breakdown, under a held chord - and if beat number 400 in the list is
    actually the 402nd beat of the song, fitting against list position puts a
    step in the middle of the run and no line fits anything after it. Rounding
    (t - anchor) / period back to an integer gives each beat its real index and
    a gap costs nothing.

    Returns (period, anchor, residuals, indices).
    """
    if len(bt) < 3:
        return 0.5, bt[0] if len(bt) else 0.0, np.zeros(len(bt)), np.arange(len(bt))
    period = float(np.median(np.diff(bt)))
    anchor = float(bt[0])
    n = np.round((bt - anchor) / period)
    for _ in range(5):
        period, anchor = np.polyfit(n, bt, 1)
        n_new = np.round((bt - anchor) / period)
        if np.array_equal(n_new, n):
            break
        n = n_new
    return float(period), float(anchor), bt - (anchor + period * n), n


def split_runs(bt):
    """Cut the beat sequence into runs that each fit a line.

    Splits at the beat furthest from the current fit, which in practice is the
    seam itself: where two songs cross over, the residual curve is a V and its
    point is the crossover. Recursion stops when the fit is good enough or when
    a half would be too short to mean anything.
    """
    out = []
    stack = [(0, len(bt))]
    while stack:
        i, j = stack.pop()
        if j - i < MIN_BEATS:
            out.append((i, j))
            continue
        res = fit_line(bt[i:j])[2]
        if np.percentile(np.abs(res), 95) <= FIT_TOL:
            out.append((i, j))
            continue
        # Cut at the beat furthest from the fit: where two songs cross over,
        # the residual curve is a V and its point is the crossover itself.
        k = i + int(np.argmax(np.abs(res)))
        if k - i < MIN_BEATS or j - k < MIN_BEATS:
            # The worst point is at an edge, which is what a run whose tempo
            # DRIFTS looks like - the line is wrong everywhere and worst at the
            # ends. There is no seam to find, so halve it and let the merge
            # pass put back whatever did not need cutting.
            k = (i + j) // 2
            if k - i < MIN_BEATS or j - k < MIN_BEATS:
                out.append((i, j))
                continue
        stack.append((i, k))
        stack.append((k, j))
    out.sort()
    return out


def merge_runs(bt, runs):
    """Rejoin neighbouring runs that turn out to be the same grid.

    The recursion above splits on the worst point, which sometimes cuts a song
    that a single line would have fitted after all. Trying the join and keeping
    it only when it still fits undoes exactly those cuts.
    """
    merged = [runs[0]]
    for run in runs[1:]:
        i, j = merged[-1][0], run[1]
        res = fit_line(bt[i:j])[2]
        if np.percentile(np.abs(res), 95) <= FIT_TOL:
            merged[-1] = (i, j)
        else:
            merged.append(run)
    return merged


def support(env_norm, times, period):
    """Onset energy at the grid's beats over energy half a beat off them.

    The residual check only says the tracked beats are evenly spaced; this says
    they are spaced around something real. A grid locked to the offbeat scores
    at or below 1.
    """
    def energy(ts):
        idx = np.round((ts - FRAME_OFFSET) / FRAME_SEC).astype(np.int64)
        idx = idx[(idx >= 1) & (idx < len(env_norm) - 1)]
        if not len(idx):
            return 0.0
        # Take the best of three frames: a beat that is 6 ms early still counts.
        return float(np.maximum(np.maximum(env_norm[idx - 1], env_norm[idx]),
                                env_norm[idx + 1]).mean())
    on = energy(times)
    off = energy(times + period * 0.5)
    return on / max(off, 1e-6)


def downbeat(low_norm, times, index, beats_per_bar=4):
    """Which beat of the bar carries the low end. Returns (offset, confidence).

    Grouped by the beat's INDEX in the grid, not by its position in the list,
    so a dropped beat does not rotate the bar for everything after it.
    """
    idx = np.round((times - FRAME_OFFSET) / FRAME_SEC).astype(np.int64)
    ok = (idx >= 1) & (idx < len(low_norm) - 1)
    e = np.zeros(len(times))
    e[ok] = np.maximum(np.maximum(low_norm[idx[ok] - 1], low_norm[idx[ok]]),
                       low_norm[idx[ok] + 1])
    r = np.mod(index, beats_per_bar).astype(int)
    score = np.array([e[r == k].mean() if np.any(r == k) else 0.0
                      for k in range(beats_per_bar)])
    if score.sum() <= 0:
        return 0, 0.0
    # 0 when all four are equal, 1 when one carries everything.
    conf = (score.max() * beats_per_bar / score.sum() - 1.0) / (beats_per_bar - 1.0)
    return int(np.argmax(score)), float(conf)


def analyze(src, out, scratch):
    wav = decode(src, os.path.join(scratch, 'soundtrack.mono22k.wav'))
    print('onset envelope...', flush=True)
    full, low, duration = onset_envelope(wav, os.path.join(scratch, 'onset-env.npz'))
    print(f'  {duration:.1f}s, {len(full)} frames', flush=True)

    track_env = full + LOW_WEIGHT * low
    print('beat tracking...', flush=True)
    bt = track_beats(track_env, duration)
    print(f'  {len(bt)} beats, {60 * len(bt) / duration:.2f} BPM average', flush=True)

    print('segmenting...', flush=True)
    runs = merge_runs(bt, split_runs(bt))
    print(f'  {len(runs)} segments', flush=True)

    # Normalised copies for the support and downbeat tests, so both compare
    # against the local loudness rather than against the whole file's.
    def normalise(e):
        dec = 512
        m = e[:len(e) // dec * dec].reshape(-1, dec).mean(axis=1)
        k = max(1, int(6.0 / (FRAME_SEC * dec)))
        pad = np.pad(m, (k, k), mode='edge')
        roll = np.lib.stride_tricks.sliding_window_view(pad, 2 * k + 1)
        sc = np.repeat(np.median(roll, axis=1), dec)
        sc = np.pad(sc, (0, len(e) - len(sc)), mode='edge')
        return e / np.maximum(sc, 1e-3)

    full_n, low_n = normalise(full), normalise(low)

    segments = []
    for i, (a, b) in enumerate(runs):
        beats = bt[a:b]
        # Segment bounds meet halfway between the runs, so they tile the file.
        t0 = 0.0 if a == 0 else (bt[a - 1] + bt[a]) * 0.5
        t1 = duration if b >= len(bt) else (bt[b - 1] + bt[b]) * 0.5
        period, anchor, res, index = fit_line(beats)
        p95 = float(np.percentile(np.abs(res), 95))
        grid = anchor + period * index
        sup = support(full_n, grid, period)
        # OFFBEAT LOCK is beat tracking's classic failure: the grid is perfectly
        # periodic and perfectly wrong, sitting in the gaps between the beats
        # instead of on them. It shows up as a good fit with support below 1,
        # and the fix is the whole distance between the two answers - half a
        # beat. Nothing else about the fit changes.
        if sup < 1.0:
            shifted = grid + period * 0.5
            sup_shift = support(full_n, shifted, period)
            if sup_shift > sup:
                anchor += period * 0.5
                grid = shifted
                sup = sup_shift
        bar, bar_conf = downbeat(low_n, grid, index)
        bpm = 60.0 / period if period > 0 else 0.0

        if p95 <= FIT_TOL and len(beats) >= MIN_BEATS and sup >= MIN_SUPPORT and 60 <= bpm <= 200:
            # Re-anchor to the first grid beat at or after t0 so the runtime
            # never has to count backwards from a time outside the segment.
            n0 = int(np.ceil((t0 - anchor) / period))
            segments.append(dict(
                t0=round(t0, 4), t1=round(t1, 4), quantized=True,
                bpm=round(bpm, 3), period=round(period, 8),
                anchor=round(anchor + n0 * period, 6),
                beatsPerBar=4, barOffset=int(np.mod(bar - n0, 4)),
                jitterMs=round(p95 * 1000, 1), support=round(sup, 2),
                barConf=round(bar_conf, 2)))
        else:
            segments.append(dict(
                t0=round(t0, 4), t1=round(t1, 4), quantized=False,
                beats=[round(x, 4) for x in beats],
                jitterMs=round(p95 * 1000, 1), support=round(sup, 2)))
        print(f'  segment {i + 1}/{len(runs)}', end='\r', flush=True)
    print(' ' * 40, end='\r')

    doc = dict(version=1, source=os.path.relpath(src), duration=round(duration, 4),
               # Added to every beat time at runtime. Non-zero only if the
               # browser's decoder disagrees with ffmpeg about where sample zero
               # is; measure it with music.calibrate() from the console.
               offset=0.0,
               generator='tools/analyze_beats.py', segments=segments)
    with open(out, 'w') as f:
        json.dump(doc, f, separators=(',', ':'))
    report(doc)
    print(f'\nwrote {out} ({os.path.getsize(out) / 1024:.1f} KB)')


def report(doc):
    segs = doc['segments']
    q = [s for s in segs if s['quantized']]
    covered = sum(s['t1'] - s['t0'] for s in q)
    print(f"\n{len(segs)} segments, {len(q)} quantized "
          f"({covered / doc['duration'] * 100:.1f}% of runtime), {len(segs) - len(q)} raw")
    if q:
        bpms = sorted(s['bpm'] for s in q)
        jit = sorted(s['jitterMs'] for s in q)
        print(f"  tempo {bpms[0]:.2f}..{bpms[-1]:.2f} BPM   "
              f"grid jitter median {jit[len(jit) // 2]:.1f} ms")
    print(f"\n{'start':>9} {'end':>9} {'len':>7} {'bpm':>8} {'jitter':>8} {'sup':>5}  bar")
    for s in segs:
        head = f"{s['t0']:9.1f} {s['t1']:9.1f} {s['t1'] - s['t0']:7.1f}"
        if s['quantized']:
            print(f"{head} {s['bpm']:8.2f} {s['jitterMs']:6.1f}ms {s['support']:5.2f}  "
                  f"+{s['barOffset']} ({s['barConf']:.2f})")
        else:
            print(f"{head} {'raw':>8} {s['jitterMs']:6.1f}ms {s['support']:5.2f}  "
                  f"{len(s['beats'])} beats")


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', default='assets/audio/soundtrack.m4a')
    ap.add_argument('--out', default='assets/audio/soundtrack.beats.json')
    ap.add_argument('--scratch', default=os.environ.get('BEAT_SCRATCH', '/tmp'))
    ap.add_argument('--report', action='store_true')
    a = ap.parse_args()
    if a.report:
        report(json.load(open(a.out)))
        sys.exit(0)
    analyze(a.src, a.out, a.scratch)
