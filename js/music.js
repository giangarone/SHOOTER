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
// detection. With fftSize 256 over a 44.1kHz context each bin is ~172Hz, so
// six bins is roughly everything under 1kHz - kick, sub, and the low end of a
// snare, which is what a four-to-the-floor track puts its pulse in.
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
    this.muted = false;
    this._started = false;
    this.analyser = null;
    this._freq = null;
    // Envelope-follower state for level(). `_avg` is the running bass floor the
    // onset test measures against; `_lvl` is the smoothed output.
    this._prevE = 0;
    this._fluxAvg = 0;
    this._lvl = 0;
    this._beat = 0;
    this._beatCd = 0;
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
      this.gain.gain.value = this.muted ? 0 : VOLUME;

      this.node.connect(this.filter);
      this.filter.connect(this.gain);
      this.gain.connect(ctx.destination);
      // The branch. Note it is NOT connected onward to anything.
      this.node.connect(this.analyser);
    }
    // Rejects when the browser is not satisfied the gesture was real. Not an
    // error worth surfacing: the next gesture calls start() again.
    this.el.play().catch(() => {});
  }

  // Sweeps the cutoff between clean and muffled. `on` true = muffled.
  // Called every frame from the game loop, so it must be cheap and idempotent
  // when nothing has changed.
  setMuffled(on) {
    const to = on ? MUFFLED_HZ : FULL_HZ;
    if (!this.filter || to === this._target) return;
    this._target = to;
    const p = this.filter.frequency;
    const now = this.filter.context.currentTime;
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
    if (!this.analyser || !this.el || this.el.paused) {
      this._lvl = 0;
      this._beat = Math.max(0, this._beat - dt * 6);
      return;
    }
    this.analyser.getByteFrequencyData(this._freq);
    let sum = 0;
    for (let i = BASS_LO; i < BASS_HI; i++) sum += this._freq[i];
    const e = sum / ((BASS_HI - BASS_LO) * 255);

    // SPECTRAL FLUX: how much the bass energy ROSE since the last frame. This
    // is the measurement that finds a kick drum. Only rises count - a decay is
    // not an onset - which is what the clamp at zero is doing.
    const flux = Math.max(0, e - this._prevE);
    this._prevE = e;

    // A smoothed level for anything that wants brightness rather than rhythm.
    this._lvl += (e - this._lvl) * Math.min(1, dt * 12);

    // The floor a flux spike has to clear, tracked slowly so it follows the
    // track from a breakdown into a drop without ever needing a fixed number.
    this._fluxAvg += (flux - this._fluxAvg) * Math.min(1, dt * 3);

    this._beatCd -= dt;
    if (flux > this._fluxAvg * FLUX_MULT + FLUX_DELTA && this._beatCd <= 0) {
      this._beat = 1;
      this._beatCd = REFRACTORY;
    } else {
      // Decays between kicks, so `beat` is an envelope the rig can fade with
      // rather than a one-frame spike it would have to latch itself.
      this._beat = Math.max(0, this._beat - dt * 6);
    }
  }

  get level() {
    return this._lvl;
  }

  get beat() {
    return this._beat;
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
    g.linearRampToValueAtTime(on ? 0 : VOLUME, now + 0.12);
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }
}
