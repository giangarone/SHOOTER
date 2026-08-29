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
