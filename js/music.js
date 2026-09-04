// Looping background soundtrack, and the muffle that sits over it.
//
// WHY A MEDIA ELEMENT, NOT decodeAudioData: the track is nearly three hours
// long. Decoded to float32 it would be gigabytes of RAM, so it streams
// through an <audio> element and reaches the graph as a MediaElementSource.
// The element also gives us `loop` for free, which is what "plays forever"
// means here - it wraps at the end with no gap and no bookkeeping.
//
// GRAPH:  <audio> -> src -> lowpass -> gain -> ctx.destination
//
// The lowpass is ALWAYS in the chain, even when the music is meant to sound
// normal - it just sits at FULL_HZ, which is above anything the file
// contains, so it passes everything through. Swapping the node in and out
// instead would click, and clicking is the exact thing this is meant to
// avoid.
//
// It connects to ctx.destination directly rather than to SFX's master gain,
// so the music volume slider (this.gain) and the sound-effect level stay
// independent. SFX owns the AudioContext; this module borrows it.
//
// THE ANALYSER IS A BRANCH, NOT A LINK. It hangs off `node` - the raw source,
// BEFORE the lowpass and before the gain - so what it reads is the track
// itself: unaffected by the muffle sweep, and unaffected by muting. That is
// deliberate. The lighting rig dances to this signal, and it should keep
// dancing when the player has turned the music down. An AnalyserNode needs no
// destination to run; nothing is routed through it.

// WHERE THE BEAT COMES FROM: a beat map analysed offline (beatmap.js,
// tools/analyze_beats.py), looked up against the playback position, with the
// live flux detector below kept only as the fallback for when the map is
// missing or does not cover the moment. The detector's own notes are still
// worth reading - they are why the map exists.

import { BeatMap } from './beatmap.js';

// Cutoff when the music plays clean. Chosen above the audible range so the
// filter is transparent rather than merely subtle.
const FULL_HZ = 20000;
// Cutoff when muffled. Low enough to read as "behind a door" while leaving
// the melody recognisable - the player should still know the track is there.
const MUFFLED_HZ = 380;
// Seconds for a cutoff change to complete. Long enough to hear as a sweep
// rather than a switch, short enough that it has settled by the time the
// player has walked to the first totem.
const SWEEP = 0.7;
// Playback level. Well under the effects so gunfire always reads over it.
const VOLUME = 0.32;
// Bins from the bottom of the spectrum that count as "bass" for beat
// detection. With fftSize 512 over a 44.1kHz context each bin is ~86Hz.
// Bin 0 is DC and the sub rumble under it; 1..3 is roughly 86-344Hz, which is
// where a kick drum's fundamental lives. Starting at 1 keeps a track's overall
// loudness out of the measurement.
const BASS_LO = 1;
const BASS_HI = 4;
// Onset thresholds, on the FLUX signal rather than on raw energy - see
// sample(). All three were tuned by replaying the actual soundtrack through
// this exact maths offline and checking the detected rate against the track's
// real tempo: at these values it reports 144.1 BPM against a true 144.0, with
// the beats landing within 3% of the true beat grid.
//
// Raw energy does NOT work here and was tried first: a mastered dance track
// pins the bass bins near the top of the range and holds them there, so
// "louder than average" is true almost continuously. The kick is a CHANGE in
// that energy, not a level of it.
const FLUX_MULT = 2.5;
const FLUX_DELTA = 0.015;
// Seconds a beat suppresses the next one. 0.34 caps detection at ~176 BPM; a
// faster track simply reports every other beat, which still looks right.
const REFRACTORY = 0.34;
// Below this the signal counts as nothing to listen to and the free-running
// fallback takes over.
const SILENT = 0.02;
// The fallback's tempo, in beats per second - about 144 BPM, matching the
// shipped soundtrack, so the handover in either direction is not a lurch.
const FALLBACK_BPS = 2.4;

// Beat map file, derived from the audio path: soundtrack.m4a -> soundtrack.beats.json.
const MAP_SUFFIX = '.beats.json';

// How fast the beat envelope falls after a hit, in units per second. Shared by
// the map-driven path and the detector so the handover between them is not
// also a change of feel; 6 is the ramp the detector has always used.
const BEAT_DECAY = 6;
// How long before a beat the envelope starts to lift, and how high it gets by
// the time the beat lands. Only the map can do this - a detector cannot know a
// beat is coming - and it is most of why a mapped beat reads as tighter than a
// detected one at the same accuracy: the room leans into the hit instead of
// answering it. Set PRE_GAIN to 0 for a purely reactive envelope.
const PRE_SEC = 0.09;
const PRE_GAIN = 0.3;

// PLAYBACK CLOCK. `el.currentTime` is the only handle on where the track is,
// and it is a poor one: it advances in visible steps rather than continuously,
// it is updated on a cadence unrelated to the frame loop, and read straight it
// gives a position that jitters by tens of milliseconds. Which is the whole
// budget - a beat is only interesting to within about 20ms.
//
// So it is treated as a REFERENCE that a smooth clock is steered towards,
// never as the clock. The clock itself runs on ctx.currentTime: the audio
// device's own timebase, which is exactly what the samples are being clocked
// out against, and which advances smoothly.
//
// SLEW caps how fast a correction may be applied, as a fraction of real time.
// At 5% a 50ms error is gone inside a second and nothing on screen lurches.
const SLEW = 0.05;
// Bigger than this is not drift - it is a seek, or the loop wrapping - and the
// clock jumps to the new position instead of crawling to it.
const RESYNC = 0.35;

// THE INTRO. The track no longer starts at 0:00, and it no longer waits for a
// run to begin - it is playing under the menu, from a random point in the
// first ninety minutes, so a session does not always open on the same two
// songs. Three hours of soundtrack is wasted if everyone only ever hears the
// front of it.
//
// A random point lands wherever it lands, and a good share of a dance record
// is a drop. Cutting into the middle of one at full volume is a jump scare, so
// the first ten seconds are a fade: the gain rises from silence and the lowpass
// opens from under the music, which is the same "behind a door" sweep the
// muffle uses, run slowly and in reverse. Long enough to feel like the room
// letting you in rather than a fade-in someone forgot to shorten.
const INTRO_SEC = 10;
// Where the intro's cutoff starts. Below MUFFLED_HZ: the muffle is meant to
// leave the melody recognisable, and this is meant to leave almost nothing,
// so that what happens over the ten seconds is the track ARRIVING.
const INTRO_HZ = 120;
// The window the random start is drawn from, in seconds - 0:00 to 1:30:00.
// Not the whole file, so a start never lands close enough to the end to wrap
// during the fade, and so the tail stays somewhere a long session gets to
// rather than somewhere a short one opens on.
const START_WINDOW = 5400;

export class Music {
  constructor(src) {
    this.src = src;
    this.el = null;
    this.node = null;
    this.filter = null;
    this.gain = null;
    // Last cutoff we ramped towards. Guards the ramp so holding a state does
    // not restack an identical automation event every frame.
    this._target = FULL_HZ;
    // Audio-clock time the ten-second fade finishes, or 0 once it has. While
    // it is running the filter belongs to the intro and setMuffled() aims at
    // this instead of at its own short sweep.
    this._introEnd = 0;
    this.muted = false;
    this._started = false;
    this.analyser = null;
    this._freq = null;
    // Envelope-follower state for sample(). `_prevE` is last frame's band
    // energy, which is what the flux is measured against; `_fluxAvg` is the
    // running floor an onset has to clear.
    this._prevE = 0;
    this._fluxAvg = 0;
    // What the analyser actually hears, kept separate from the published
    // values so the fallback below can replace them without feeding its own
    // output back into the follower on the next frame.
    this._realLvl = 0;
    this._realBeat = 0;
    this._fluxBeat = 0;
    this._lvl = 0;
    this._beat = 0;
    this._beatCd = 0;
    this._fallbackT = 0;

    // Pre-analysed beat grid, or null while it loads and null forever if it is
    // not there. Fetched from the constructor rather than from start() so it
    // is ready long before the first user gesture can be made; it is a few
    // kilobytes, and nothing waits on it either way.
    this.map = null;
    BeatMap.load(src.replace(/\.[^./]+$/, MAP_SUFFIX)).then((m) => { this.map = m; });

    // Smoothed playback position in seconds into the file. Null whenever
    // nothing is playing, which is also how the first frame knows to seed it.
    this._pos = null;
    this._ctxT = 0;
    // Published alongside beat/level once the map is driving. `bar` counts
    // 0..3 through the bar and `downbeat` is true on the one.
    this._bar = 0;
    this._downbeat = false;
    this._bpm = 0;
    this._synced = false;
    // Keeps a four-count running when the map is not driving, off the
    // detector's own beats, so anything reading `bar` always has one. It is a
    // count, not a bar: nothing here knows where the ONE is, which is why
    // `downbeat` stays false and `synced` says so.
    this._barCount = 0;
    // THE PULSE. A monotonically increasing HALF-beat index: it steps on every
    // downbeat and again on every upbeat, so `pulse` changing is the single
    // edge that everything rhythmic in the game acts on - sentry guns firing
    // twice a beat, fire ticking twice a beat, poison ticking once.
    //
    // A COUNTER, NOT AN EVENT. There is no subscription anywhere in this file
    // and there should not be: consumers keep their own `_lastPulse` and
    // compare, which is the same edge-detect trick the lighting rig already
    // uses on `bar`, and it cannot miss a beat inside a long frame or fire one
    // twice inside a short one.
    //
    // `pulseWhole` says whether the pulse now standing is a whole beat rather
    // than the upbeat between two - that is what separates poison's one tick a
    // beat from fire's two.
    this._pulse = 0;
    this._pulseWhole = true;
    // Where the pulse stood last frame, in track seconds when the map is
    // driving and in free-running half-beats when it is not.
    this._pulseAt = null;
    this._pulseFree = 0;
    this._cal = null;
  }

  // Builds the graph and starts playback. Takes the AudioContext from SFX so
  // both share one context - a second context would be a second output device
  // as far as the browser is concerned.
  //
  // Must be called from a user gesture, for the same reason SFX.ensure() must
  // be: autoplay is blocked otherwise. Safe to call repeatedly; only the first
  // call builds anything, and later ones just retry a playback the browser
  // refused. That retry matters - the first attempt can still be rejected if
  // the gesture had already been spent elsewhere.
  start(ctx) {
    if (!ctx) return;
    if (!this._started) {
      this._started = true;
      this.el = new Audio(this.src);
      this.el.loop = true;
      this.el.preload = 'auto';
      // Without this the browser taints the graph and the filter outputs
      // silence, even though the file is same-origin.
      this.el.crossOrigin = 'anonymous';

      this.analyser = ctx.createAnalyser();
      // 512 gives ~86Hz bins at 44.1k, which is fine enough to isolate a kick
      // fundamental from the bass line sitting just above it.
      this.analyser.fftSize = 512;
      // Smoothing is done in JS below instead. The node's own smoothing is a
      // fixed filter over FFT frames that adds lag we cannot compensate for,
      // and lag is exactly what makes lights miss the beat.
      this.analyser.smoothingTimeConstant = 0;
      // The default window (-100..-30 dB) saturates on mastered music: every
      // bass bin pins near 255 and there is no dynamic range left to find a
      // transient in. This window sits where a loud track actually lives.
      this.analyser.minDecibels = -70;
      this.analyser.maxDecibels = -5;
      this._freq = new Uint8Array(this.analyser.frequencyBinCount);

      this.node = ctx.createMediaElementSource(this.el);
      this.filter = ctx.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.filter.frequency.value = FULL_HZ;
      // Flat response. The default Q of 1 puts a bump at the cutoff, which
      // on a sweep sounds like a whistle chasing the music down.
      this.filter.Q.value = 0.0001;
      this.gain = ctx.createGain();
      // Silent to begin with. The ramp is scheduled below, once the graph is
      // connected - starting at VOLUME and ramping down would put a full-level
      // frame out first, which is the click this whole file exists to avoid.
      this.gain.gain.value = 0;

      this.node.connect(this.filter);
      this.filter.connect(this.gain);
      this.gain.connect(ctx.destination);
      // The branch. Note it is NOT connected onward to anything.
      this.node.connect(this.analyser);

      // A random point in the first ninety minutes. currentTime cannot be
      // written before the element knows how long the file is, and on a cold
      // load it does not yet, so the seek waits for the metadata when it has
      // to. Setting it late is harmless: the playback clock treats a jump
      // bigger than RESYNC as a seek and re-seeds itself.
      const seek = Math.random() * START_WINDOW;
      if (this.el.readyState >= 1) this.el.currentTime = seek;
      else this.el.addEventListener('loadedmetadata', () => { this.el.currentTime = seek; }, { once: true });

      // The fade. `_introEnd` is on the AUDIO clock, which is what the ramps
      // below are scheduled against, and it is what setMuffled() reads to know
      // it should retarget the intro sweep rather than cut across it.
      const now = ctx.currentTime;
      this._introEnd = now + INTRO_SEC;
      this.filter.frequency.setValueAtTime(INTRO_HZ, now);
      this.filter.frequency.exponentialRampToValueAtTime(this._target, this._introEnd);
      this.gain.gain.setValueAtTime(0, now);
      this.gain.gain.linearRampToValueAtTime(this.muted ? 0 : VOLUME, this._introEnd);
    }
    // Rejects when the browser is not satisfied the gesture was real, which is
    // the NORMAL case for the call the game makes at launch - autoplay is
    // blocked until the player touches something. Not an error worth
    // surfacing: the next gesture calls start() again, the graph above is
    // already built, and playback picks up from the same random point.
    this.el.play().catch(() => {});
  }

  // Advances the smoothed playback position and returns it, or null when
  // nothing is playing. See the SLEW/RESYNC note above for why this exists
  // rather than just reading el.currentTime.
  _clock() {
    const el = this.el;
    if (!el || el.paused || el.readyState < 2 || !this.filter) {
      this._pos = null;
      return null;
    }
    const now = this.filter.context.currentTime;
    const raw = el.currentTime;
    if (this._pos === null || Math.abs(raw - this._pos) > RESYNC) {
      // First frame, a seek, or the loop wrapping back to the top.
      this._pos = raw;
      this._ctxT = now;
      return this._pos;
    }
    // Advance on the audio clock, then close a fraction of the gap to what the
    // element says. Correcting by a capped amount rather than by the whole
    // error is what turns the element's stepping into a straight line.
    const adv = Math.max(0, now - this._ctxT);
    this._ctxT = now;
    this._pos += adv;
    const cap = SLEW * adv;
    this._pos += Math.max(-cap, Math.min(cap, raw - this._pos));
    return this._pos;
  }

  // Where the track is for the LISTENER, which is behind where the graph is by
  // however deep the device's output buffers are. Lights have to use this one:
  // driven from the graph position they run early by the output latency, which
  // on a Bluetooth headset is over a tenth of a second and unmistakable.
  _heard(pos) {
    const ctx = this.filter.context;
    return pos - (ctx.outputLatency || 0) - (ctx.baseLatency || 0);
  }

  // Sweeps the cutoff between clean and muffled. `on` true = muffled.
  // Called every frame from the game loop, so it must be cheap and idempotent
  // when nothing has changed.
  //
  // While the ten-second intro fade is still running it owns the filter, and a
  // change here only moves where that fade lands.
  setMuffled(on) {
    const to = on ? MUFFLED_HZ : FULL_HZ;
    if (to === this._target) return;
    this._target = to;
    // No graph yet - the state was set before the first gesture got through.
    // start() reads `_target` when it builds one, so the intro will open onto
    // the right cutoff rather than onto a stale one.
    if (!this.filter) return;
    const p = this.filter.frequency;
    const now = this.filter.context.currentTime;
    if (now < this._introEnd) {
      // Mid-fade. Retarget the intro's own sweep rather than cutting across it
      // with a 0.7s one: a state change during the fade - the player starting
      // a run before the room has finished opening up - should change where
      // the ten seconds ARRIVE, not abandon them.
      p.cancelScheduledValues(now);
      p.setValueAtTime(Math.max(p.value, 1), now);
      p.exponentialRampToValueAtTime(to, this._introEnd);
      return;
    }
    this._introEnd = 0;
    // Cancel-and-hold from the CURRENT value, not from the last target: a
    // state that flips mid-sweep has to continue from where the sweep
    // actually got to, or it jumps.
    p.cancelScheduledValues(now);
    p.setValueAtTime(p.value, now);
    // Exponential, because pitch is perceived logarithmically - a linear ramp
    // spends most of its time in the top octave where nothing is audibly
    // happening, then drops through the whole audible range at the end.
    p.exponentialRampToValueAtTime(to, now + SWEEP);
  }

  // Reads the bass end of the spectrum and returns { level, beat }:
  //
  //   level  0..1 smoothed bass energy - how loud the low end is right now
  //   beat   0..1 onset strength, spiking on a kick and decaying between them
  //
  // Beat is what makes the lights land ON the music rather than merely near
  // it. It fires when the instantaneous reading jumps a good margin above the
  // running average, which is what a kick drum is: a transient over a floor.
  // Comparing against a running average rather than a fixed threshold is what
  // keeps it working through a quiet breakdown and through a loud drop alike.
  //
  // Allocates nothing - `_freq` is reused - because this runs every frame.
  // Returns zeros until the graph exists, i.e. for the whole pre-gesture menu;
  // callers must have something to fall back on.
  sample(dt) {
    let fired = false;
    if (this.analyser && this.el && !this.el.paused) {
      this.analyser.getByteFrequencyData(this._freq);
      let sum = 0;
      for (let i = BASS_LO; i < BASS_HI; i++) sum += this._freq[i];
      const e = sum / ((BASS_HI - BASS_LO) * 255);

      // SPECTRAL FLUX: how much the bass energy ROSE since the last frame.
      // This is the measurement that finds a kick drum. Only rises count - a
      // decay is not an onset - which is what the clamp at zero is doing.
      const flux = Math.max(0, e - this._prevE);
      this._prevE = e;

      // A smoothed level for anything that wants brightness rather than rhythm.
      this._realLvl += (e - this._realLvl) * Math.min(1, dt * 12);

      // The floor a flux spike has to clear, tracked slowly so it follows the
      // track from a breakdown into a drop without ever needing a fixed number.
      this._fluxAvg += (flux - this._fluxAvg) * Math.min(1, dt * 3);

      this._beatCd -= dt;
      if (flux > this._fluxAvg * FLUX_MULT + FLUX_DELTA && this._beatCd <= 0) {
        this._fluxBeat = 1;
        this._beatCd = REFRACTORY;
        fired = true;
      } else {
        // Decays between kicks, so `beat` is an envelope a caller can fade
        // with rather than a one-frame spike it would have to latch itself.
        this._fluxBeat = Math.max(0, this._fluxBeat - dt * BEAT_DECAY);
      }
    } else {
      this._realLvl = 0;
      this._fluxBeat = 0;
    }

    // THE MAP DRIVES THE BEAT when it has something to say about this moment;
    // the detector above is the fallback, and it keeps running either way so
    // that calibrate() has something to compare against and so the handover
    // when a map runs out is instant rather than a fade-in from zero.
    const pos = this._clock();
    const heard = pos === null ? 0 : this._heard(pos);
    const b = pos !== null && this.map ? this.map.at(heard) : null;
    if (b) {
      // Same 1/6s fall as the detector, plus a lift on the approach - the one
      // thing knowing the future buys. Both distances are measured against the
      // grid rather than accumulated per frame, so a long frame cannot make
      // the envelope drift.
      const since = heard - b.last;
      const until = b.next - heard;
      let e = Math.max(0, 1 - Math.max(0, since) * BEAT_DECAY);
      if (until < PRE_SEC) e = Math.max(e, (1 - until / PRE_SEC) * PRE_GAIN);
      this._realBeat = e;
      this._bar = b.bar;
      this._downbeat = b.downbeat;
      this._bpm = b.bpm;
      this._synced = true;
      // THE UPBEAT IS THE MIDPOINT, which is the one thing the map hands over
      // for free: it already knows where this beat started and where the next
      // one lands. Both edges are tested against the grid rather than counted
      // per frame, so a stall cannot drift the pulse off the music.
      const mid = (b.last + b.next) / 2;
      const at = heard >= mid ? mid : b.last;
      if (this._pulseAt === null || at !== this._pulseAt) {
        // A seek or a loop can move `at` BACKWARDS. The index still only ever
        // goes up - consumers compare for inequality, not for order, and an
        // index that went back would make one of them fire twice.
        this._pulseAt = at;
        this._pulse++;
        this._pulseWhole = at === b.last;
      }
    } else {
      this._realBeat = this._fluxBeat;
      if (fired) this._barCount = (this._barCount + 1) & 3;
      this._bar = this._barCount;
      this._downbeat = false;
      this._bpm = 0;
      this._synced = false;
    }
    // NO MAP, SO THE PULSE FREE-RUNS. Combat is built on this edge now - fire,
    // poison and every sentry gun in the arena - so it cannot simply stop
    // because the beat map is missing, the track has run past its end or the
    // player has muted the music. It falls back to the detector's tempo where
    // there is one and to FALLBACK_BPS otherwise, which is the same clock the
    // brightness already falls back to.
    if (!this._synced) {
      const bps = this._bpm > 0 ? this._bpm / 60 : FALLBACK_BPS;
      this._pulseFree += dt * bps * 2;
      const n = Math.floor(this._pulseFree);
      if (this._pulseAt !== n) {
        this._pulseAt = n;
        this._pulse++;
        this._pulseWhole = (n & 1) === 0;
      }
    }
    if (this._cal) this._calibrateStep(dt, pos, fired);

    // ONE fallback, for every consumer. The lighting rig and the dancing
    // crowd both read `beat` and `level`, and they used to each decide
    // separately what to do when the music said nothing - which left the
    // lights pulsing over a frozen crowd on the pre-gesture menu, where the
    // graph does not exist yet. Deciding it here means they cannot disagree.
    if (this._realLvl >= SILENT) {
      this._lvl = this._realLvl;
      this._beat = this._realBeat;
    } else {
      this._fallbackT += dt * FALLBACK_BPS;
      const f = this._fallbackT % 1;
      // The map still knows where the beats are through a breakdown, so when
      // it is driving only the BRIGHTNESS needs standing in for. Without the
      // map there is nothing to go on and the whole thing free-runs.
      this._beat = this._synced ? this._realBeat : Math.max(0, 1 - f * 4);
      // Nothing is playing, so the detector fires nothing and the count above
      // would sit still. The free-running tempo is the only clock left.
      if (!this._synced) this._bar = Math.floor(this._fallbackT) & 3;
      this._lvl = 0.35 + Math.sin(this._fallbackT * 0.6) * 0.1;
    }
  }

  // Checks the beat map against what the browser is really playing, by timing
  // the live detector's onsets against the map's beats.
  //
  // WHAT IT IS FOR: the map's times come from ffmpeg's decode of the file, and
  // the browser has its own decoder. AAC carries priming samples in front of
  // the audio, and how many of them a decoder drops is a convention rather than
  // a guarantee, so the two timelines can sit a few tens of milliseconds apart.
  // That disagreement is a CONSTANT, and the map's `offset` field is where it
  // goes - one number for the whole three hours.
  //
  // WHAT IT CANNOT SEPARATE, and the reason the number it prints is not simply
  // the answer: the detector is itself LATE, always, and by roughly the same
  // order. It cannot report a transient until the transient is inside the
  // analyser's window and the frame loop has come round to look. So the
  // measurement is (decoder disagreement + detector lag), and only the excess
  // over the estimated lag means anything. On the shipped file that excess
  // comes out near zero, which is why `offset` is 0.
  //
  // Both sides are read at the graph's position rather than at the listener's,
  // so output latency cancels instead of being measured in.
  //
  // A console tool, not something the game calls:  await music.calibrate()
  calibrate(seconds = 30) {
    this._cal = { left: seconds, errs: [], frames: 0, dt: 0 };
    return new Promise((resolve) => { this._cal.resolve = resolve; });
  }

  _calibrateStep(dt, pos, fired) {
    const cal = this._cal;
    cal.frames++;
    cal.dt += dt;
    if (fired && pos !== null && this.map) {
      const b = this.map.at(pos);
      if (b) {
        const d = pos - b.last < b.next - pos ? pos - b.last : pos - b.next;
        // Anything further out than a third of a beat is the detector firing
        // on something that is not the beat, and averaging it in would only
        // add noise to a measurement of a constant.
        if (Math.abs(d) < 0.12) cal.errs.push(d);
      }
    }
    cal.left -= dt;
    if (cal.left > 0) return;
    this._cal = null;
    const e = cal.errs.slice().sort((x, y) => x - y);
    const n = e.length;
    // Median, not mean: the detector's mistakes are outliers, not spread.
    const median = n ? (n % 2 ? e[(n - 1) / 2] : (e[n / 2 - 1] + e[n / 2]) / 2) : 0;
    // What the detector costs on its own: it needs the transient to be inside
    // the analyser's window (half of one, on average) and then it needs a
    // frame to come round and read it (half of one, on average).
    const ctx = this.filter ? this.filter.context : null;
    const lag = ctx
      ? this.analyser.fftSize / ctx.sampleRate * 0.5 + (cal.frames ? cal.dt / cal.frames : 0.016) * 0.5
      : 0;
    const out = {
      samples: n,
      measuredMs: +(median * 1000).toFixed(1),
      detectorLagMs: +(lag * 1000).toFixed(1),
      // The part the detector cannot explain. THIS is the candidate for the
      // map's `offset`, and only if it is big enough to hear.
      excessMs: +((median - lag) * 1000).toFixed(1),
      spreadMs: n ? +((e[Math.floor(n * 0.75)] - e[Math.floor(n * 0.25)]) * 1000).toFixed(1) : 0,
      suggestedOffset: +((this.map ? this.map.offset : 0) + median - lag).toFixed(4),
    };
    console.log('[music] beat map calibration', out,
      n < 20 ? '(too few samples to trust - run it over a busy section)' : '');
    cal.resolve(out);
    return out;
  }

  get level() {
    return this._lvl;
  }

  get beat() {
    return this._beat;
  }

  // 0..3 through the bar, and true on the one. Both are only meaningful while
  // `synced` is true; without the map there is no bar to be in.
  get bar() {
    return this._bar;
  }

  get downbeat() {
    return this._downbeat;
  }

  /**
   * A monotonically increasing HALF-beat index. It steps once on each downbeat
   * and once on each upbeat, so two per beat, and it keeps stepping whether or
   * not the beat map is driving - see the fallback in sample().
   *
   * READ IT AS AN EDGE, never as a value:
   *
   *     if (music.pulse !== this._lastPulse) {
   *       this._lastPulse = music.pulse;
   *       ...
   *     }
   *
   * which is the same shape the lighting rig uses on `bar`. It cannot miss a
   * pulse inside a long frame or fire one twice inside a short one, and it
   * needs no subscription for the same reason nothing else in this file has
   * one.
   */
  get pulse() {
    return this._pulse;
  }

  // True when the pulse now standing is a whole beat rather than the upbeat
  // between two. Anything that wants ONE tick a beat gates on this; anything
  // that wants two ignores it.
  get pulseWhole() {
    return this._pulseWhole;
  }

  // Tempo of the section playing, or 0 when the map is not driving.
  get bpm() {
    return this._bpm;
  }

  // True when `beat` is coming from the analysed map rather than from the live
  // detector - worth checking before building anything on `bar`.
  get synced() {
    return this._synced;
  }

  setMuted(on) {
    this.muted = on;
    if (!this.gain) return;
    const g = this.gain.gain;
    const now = this.gain.context.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    // Short ramp rather than a straight assignment: a gain step is a
    // discontinuity in the waveform, and that is an audible click.
    //
    // Unmuting during the intro finishes on the intro's clock instead, not on
    // this one. Someone who launches with the music muted and turns it on two
    // seconds in should get the same slow arrival as everyone else, rather
    // than the drop the fade exists to protect them from.
    const end = on ? now + 0.12 : Math.max(now + 0.12, this._introEnd);
    g.linearRampToValueAtTime(on ? 0 : VOLUME, end);
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }
}
