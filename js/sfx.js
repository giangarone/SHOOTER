// WebAudio synth. Every sound is generated from oscillators and noise buffers
// at call time - there are no audio assets. Nodes are one-shot and get
// collected once they finish playing.
//
// All the named sounds below (shoot, kill, pickupAmmo, ...) are just recipes
// over tone() and noise(). Powerups reference them by name: the `sfx` string on
// a pickup type in powerups.js must match a method here.

// The money-orb ladder: a C major pentatonic, which has no interval in it that
// can sound wrong against the track whatever key the track is in.
const COIN_LADDER = [523.25, 587.33, 698.46, 783.99, 880.0];
// Minimum seconds between two orb blips, and the silence that resets the
// ladder to the bottom.
const COIN_GAP = 0.035;
const COIN_RESET = 0.5;

export class SFX {
  constructor() {
    this.ctx = null;
    this.master = null;
    // Only used to time the reload's final click. Must match
    // Player.reloadTime in player.js.
    this.reloadDur = 1.4;
    // Ladder state for coin(). Context time, so it survives a pause.
    this._coinAt = -10;
    this._coinStep = 0;
    // Which kill texture played last, so the next one can avoid it. See kill().
    this._killTex = -1;
  }

  // Must be called from a user gesture: browsers refuse to start an
  // AudioContext otherwise. Safe to call repeatedly - it also resumes a
  // context the browser suspended.
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      // Sits against music.js's VOLUME (0.32), which runs on its own path
      // straight to the destination. The effects are the game's feedback -
      // shots, hits, pickups - so they are mixed to sit ON TOP of the track
      // rather than under it.
      this.master.gain.value = 0.38;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  // One oscillator note. f = start frequency, f2 = optional glide target,
  // t = seconds, v = peak gain, delay = seconds to wait before playing.
  // Silently does nothing until ensure() has run.
  tone({ f = 440, f2 = 0, t = 0.1, type = 'square', v = 0.5, delay = 0 }) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, now);
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(1, f2), now + t);
    g.gain.setValueAtTime(v, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + t);
    o.connect(g);
    g.connect(this.master);
    o.start(now);
    o.stop(now + t + 0.03);
  }

  // One burst of filtered white noise, fading out over its length.
  // f is the filter cutoff here, not a pitch.
  //
  // `f2` sweeps the cutoff to a second value across the burst and `mode`
  // picks the filter. Both default to the old behaviour - a flat lowpass -
  // so every sound written before them is untouched. They exist because a
  // cutoff that MOVES is the only way to get a noise burst to change
  // character as it plays, and a burst that changes character is the
  // difference between a texture and an event. See kill().
  // `q` is the filter's resonance. At the default 1 a bandpass is a gentle
  // tilt; pushed up it rings, which is how a noise burst gets a CHARACTER -
  // a knock, a thock, a clank - without ever becoming a note. See hit().
  noise({ t = 0.1, v = 0.5, f = 1000, delay = 0, f2 = 0, mode = 'lowpass', q = 1 }) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * t));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const flt = this.ctx.createBiquadFilter();
    flt.type = mode;
    flt.Q.value = q;
    flt.frequency.setValueAtTime(f, now);
    if (f2) flt.frequency.exponentialRampToValueAtTime(Math.max(20, f2), now + t);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(v, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + t);
    src.connect(flt);
    flt.connect(g);
    g.connect(this.master);
    src.start(now);
  }

  // ---- named sounds ----
  // A shot is three layers stacked inside 100ms: a bright CRACK that gives it
  // its attack, a mid BODY that gives it size, and a sub THUMP that gives it
  // weight. The old shot had a body and a little thump but no crack at all,
  // which is what made it read as a soft pop - the transient is the part the
  // ear hears as force, and it has to be short enough to be felt rather than
  // heard as its own noise burst.
  //
  // The pitch jitter is what stops a held trigger from becoming one flat
  // repeated tone. Real repeated shots are never identical, and at this depth
  // the variation is felt rather than noticed.
  // Gains are ~1.8x what they were. The gun and the hitmarker are the two
  // sounds the player is steering by, and they were sitting level with the
  // track instead of on top of it. Lifted here rather than at the master,
  // which would have dragged every pickup and console cue up with them and
  // lost the balance those already have against the music.
  shoot() {
    const k = 0.94 + Math.random() * 0.12;
    this.noise({ t: 0.02, v: 0.9, f: 7000 });
    this.noise({ t: 0.07, v: 0.54, f: 1500 });
    this.tone({ f: 150 * k, f2: 46, t: 0.09, type: 'triangle', v: 0.76 });
  }
  // THE ENEMY KILL. A tonal impact rather than a noise burst: filtered noise
  // reads as hiss however it is shaped, and what makes the SHOT feel like
  // force is its low triangle sweep. This is built the same way, pitched
  // above the gun and falling faster, so it lands as a related but distinct
  // event - same instrument, different note.
  //
  //   attack  one very short LOWPASSED click. It gives the onset definition
  //           with no top end; putting this energy up at 3-8kHz is what made
  //           earlier versions sound thin and sharp
  //   body    the triangle. The punch, and the loudest thing here
  //   sub     a sine underneath for weight, decaying a little slower
  //
  // VARIATION, because this now fires on every kill. Three flavours differing
  // in where the body starts and how fast it falls, never the same one twice
  // running, with the pitches randomised inside each. They stay close enough
  // together to read as one sound the game owns rather than three sounds.
  //
  // `size` is the dead enemy's collision radius, normalised around the 0.5
  // the standard roster shares: bigger things ring lower. The clamp is
  // gentle - this colours the kill, it does not restage it.
  kill(size = 0.5) {
    const r = (a, b) => a + Math.random() * (b - a);
    const w = Math.max(0.85, Math.min(1.6, size / 0.5));
    const d = 0.02;

    const last = this._killTex;
    let tex = Math.floor(Math.random() * 3);
    if (tex === last) tex = (tex + 1 + Math.floor(Math.random() * 2)) % 3;
    this._killTex = tex;
    const base = [268, 246, 292][tex];
    const fall = [0.082, 0.095, 0.072][tex];

    this.noise({ t: 0.012, v: 0.34, f: r(1000, 1500), delay: d });
    this.tone({
      f: r(base * 0.95, base * 1.05) / w, f2: 62, t: fall,
      type: 'triangle', v: 0.92, delay: d,
    });
    this.tone({ f: r(104, 122) / w, f2: 46, t: 0.1, type: 'sine', v: 0.55, delay: d });
  }

  // THE HITMARKER - a bullet connecting, not killing. Fires once per shot
  // that lands (see _shoot), which at a full auto rate is several a second,
  // so it is deliberately THE MOST SUBTLE thing in this file.
  //
  // Same family as the kill so the two read as one game, but smaller in every
  // dimension that matters: pitched higher, a third the length, roughly a
  // third the level, and no sub layer at all. The kill keeps the low end to
  // itself, which is what stops a stream of hits from muddying the moment a
  // kill actually lands - and what makes the difference between them obvious
  // without the hit ever demanding attention.
  //
  // 42ms late, so it arrives after the shot's transient rather than inside it.
  hit() {
    const r = (a, b) => a + Math.random() * (b - a);
    const d = 0.042;
    this.noise({ t: 0.01, v: 0.16, f: r(1100, 1700), delay: d });
    this.tone({ f: r(330, 384), f2: 120, t: 0.045, type: 'triangle', v: 0.34, delay: d });
  }

  // The old hit sound, kept for the two moments that are not hitmarkers: a
  // boss staggering and a ward eating a hit. Both are single, punctuating
  // events where a soft chime is right and a hitmarker tick would vanish.
  impact() {
    this.tone({ f: 880, f2: 440, t: 0.06, type: 'triangle', v: 0.3 });
  }
  // NO PITCH ANYWHERE IN HERE, deliberately - not a note, and not a falling
  // sub either. Every layer is noise, so there is nothing the ear can hear as
  // a tone and nothing that can land in or out of key with the track.
  //
  // TWO THINGS KEEP IT FROM GOING STALE, because this is the most frequent
  // sound in the game after the gun and a fixed recipe played a thousand
  // times a run stops being an event and becomes a tick.
  //
  // ROTATION. Three textures with their own character - a dry thud, a bright
  // shatter, a gritty tear - and never the same one twice running. Random
  // parameters alone only ever vary the COLOUR of one sound; swapping the
  // recipe varies its identity, which is what the ear actually tracks.
  //
  // WEIGHT. `size` is the dead thing's collision radius, normalised around
  // the 0.5 the standard roster shares. Big things ring lower and longer,
  // small things brighter and shorter, so the sound says what died as well as
  // that something did - and the variation stops being arbitrary, because it
  // is now carrying information.
  //
  // Inside a texture the parameters are still randomised, and the debris
  // chips vary in COUNT and SPACING, so the rhythm differs kill to kill too.
  // THE RUN ENDING, and nothing else - see _gameOver. This is the noise-built
  // collapse that used to play on every enemy death; it was too broad and too
  // long to fire hundreds of times against the music, but it is exactly right
  // once, for the player's own death, where length is the point.
  death(size = 0.5) {
    const r = (a, b) => a + Math.random() * (b - a);
    // Clamped so a boss part cannot drag the sound somewhere the mix has
    // never heard, and a chip cannot turn into a whistle.
    const w = Math.max(0.75, Math.min(2.4, size / 0.5));
    const low = (f) => f / w;
    const dur = (t) => t * (0.75 + w * 0.35);

    const last = this._killTex;
    let tex = Math.floor(Math.random() * 3);
    if (tex === last) tex = (tex + 1 + Math.floor(Math.random() * 2)) % 3;
    this._killTex = tex;

    let chips;
    if (tex === 0) {
      // DRY THUD. Almost no top end - it lands and stops. The quietest of the
      // three, which is what keeps a crowd going down together from piling up.
      this.noise({ t: r(0.014, 0.022), v: 0.3, f: r(2800, 4600), mode: 'highpass' });
      this.noise({ t: dur(0.11), v: 0.55, f: low(r(130, 200)) });
      chips = 1;
    } else if (tex === 1) {
      // BRIGHT SHATTER. Hard transient and a band falling away underneath it,
      // with the most debris of the three - the one that reads as breaking.
      this.noise({ t: r(0.02, 0.032), v: 0.45, f: r(5200, 9000), mode: 'highpass' });
      this.noise({
        t: dur(0.13), v: 0.34, f: r(3200, 4800), f2: low(r(500, 900)), mode: 'bandpass',
      });
      this.noise({ t: dur(0.09), v: 0.4, f: low(r(150, 220)) });
      chips = 3;
    } else {
      // GRITTY TEAR. The longest sweep and the narrowest band, so it comes
      // apart slowly rather than snapping - the one that reads as tearing.
      this.noise({ t: r(0.018, 0.028), v: 0.34, f: r(3600, 6000), mode: 'highpass' });
      this.noise({
        t: dur(0.19), v: 0.4, f: r(1400, 2400), f2: low(r(260, 480)), mode: 'bandpass',
      });
      this.noise({ t: dur(0.1), v: 0.45, f: low(r(120, 180)) });
      chips = 2;
    }

    for (let i = 0; i < chips; i++) {
      this.noise({
        t: r(0.012, 0.03), v: r(0.09, 0.18), f: low(r(1800, 6500)),
        mode: 'bandpass', delay: r(0.03, 0.16),
      });
    }
  }
  hurt() {
    this.tone({ f: 110, f2: 55, t: 0.25, type: 'sawtooth', v: 0.45 });
  }
  reload() {
    this.tone({ f: 300, t: 0.05, v: 0.3 });
    this.tone({ f: 420, t: 0.05, v: 0.3, delay: 0.12 });
    this.tone({ f: 560, t: 0.06, v: 0.35, delay: this.reloadDur - 0.1 });
  }
  // NOT the wave stinger any more, despite the name: wave start and wave
  // clear are deliberately silent. What is left are the three moments that
  // still earn a fanfare - a boss arriving, a boss enraging, and a schism
  // splitting - which is why the sound survives the removal.
  wave() {
    this.tone({ f: 330, t: 0.12, v: 0.3 });
    this.tone({ f: 440, t: 0.12, v: 0.3, delay: 0.14 });
    this.tone({ f: 660, t: 0.2, v: 0.35, delay: 0.28 });
  }
  empty() {
    this.tone({ f: 140, t: 0.05, v: 0.2 });
  }
  melee() {
    this.tone({ f: 120, f2: 60, t: 0.08, type: 'sawtooth', v: 0.4 });
    this.noise({ t: 0.12, v: 0.35, f: 800, delay: 0.02 });
    this.tone({ f: 300, f2: 100, t: 0.15, type: 'triangle', v: 0.25, delay: 0.08 });
  }
  pickupAmmo() {
    this.tone({ f: 520, t: 0.04, v: 0.25 });
    this.tone({ f: 780, t: 0.05, v: 0.25, delay: 0.05 });
    this.tone({ f: 1040, t: 0.06, v: 0.3, delay: 0.1 });
  }
  pickupHealth() {
    this.tone({ f: 440, f2: 880, t: 0.12, type: 'sine', v: 0.3 });
    this.tone({ f: 660, f2: 1320, t: 0.15, type: 'sine', v: 0.25, delay: 0.06 });
  }
  pickupBuff() {
    this.tone({ f: 550, f2: 1100, t: 0.15, type: 'triangle', v: 0.28 });
    this.tone({ f: 820, f2: 1640, t: 0.1, type: 'sine', v: 0.2, delay: 0.08 });
  }
  upgrade() {
    this.tone({ f: 440, f2: 880, t: 0.18, type: 'triangle', v: 0.3 });
    this.tone({ f: 660, f2: 1320, t: 0.2, type: 'sine', v: 0.25, delay: 0.09 });
    this.tone({ f: 990, f2: 1760, t: 0.26, type: 'sine', v: 0.2, delay: 0.18 });
  }
  buy() {
    this.tone({ f: 700, t: 0.05, v: 0.25 });
    this.tone({ f: 1050, t: 0.07, v: 0.25, delay: 0.06 });
  }
  reroll() {
    this.noise({ t: 0.14, v: 0.22, f: 3200 });
    this.tone({ f: 520, f2: 880, t: 0.12, type: 'triangle', v: 0.22 });
  }
  // ---- THE MYSTERY BOX ---------------------------------------------------
  //
  // Six voices for one object, which is more than anything else in this file
  // gets, and it is because the box is the only thing in the game that runs a
  // five-second animation the player just STANDS THERE and watches. There is no
  // gunfire over it and nothing else asking for attention, so the sound is
  // carrying the whole event - and an animation that decelerates in silence
  // reads as an animation that has hung.

  // The box coming up out of the floor. Deliberately SMALLER than the swell
  // the active item row used to rise on: that row appeared every third shop
  // and could afford to be an event, and this one is there every single wave
  // break. A fanfare thirty times a run is a fanfare nobody hears by wave ten.
  // ONE PIECE OF ARENA LANDING. This fires a dozen times in under two seconds
  // while the room assembles itself, so it has to be SHORT and it has to sit
  // under the music rather than on top of it: a low thud with a slap of noise
  // on the front and nothing sustained. Anything with a tail turns a build
  // into a drone.
  terrainRise() {
    this.tone({ f: 74, f2: 41, t: 0.16, type: 'sine', v: 0.16 });
    this.noise({ t: 0.07, v: 0.09, f: 700, mode: 'lowpass' });
  }

  boxRise() {
    this.tone({ f: 98, f2: 196, t: 0.5, type: 'sawtooth', v: 0.11 });
    this.tone({ f: 147, f2: 294, t: 0.6, type: 'sine', v: 0.13, delay: 0.04 });
    this.noise({ t: 0.3, v: 0.07, f: 900, delay: 0.02 });
  }

  // The lid. A latch letting go, then the hinge, then the light getting out -
  // and the rising sine on the end is what turns a crate opening into something
  // opening that has something in it.
  boxOpen() {
    this.noise({ t: 0.05, v: 0.3, f: 3400, mode: 'highpass' });
    this.tone({ f: 220, f2: 110, t: 0.22, type: 'square', v: 0.2 });
    this.noise({ t: 0.35, v: 0.14, f: 400, f2: 2600, mode: 'bandpass', q: 3, delay: 0.03 });
    this.tone({ f: 330, f2: 990, t: 0.4, type: 'sine', v: 0.16, delay: 0.08 });
  }

  /**
   * ONE ITEM CHANGING ON THE REEL. This fires about forty times in four
   * seconds, which sets every number in it.
   *
   * QUIET, AND TWELVE MILLISECONDS LONG. Anything with a tail overlaps the next
   * click and forty of them become a buzz; anything at the volume of a normal
   * cue in this file becomes unbearable by the third roll of a run.
   *
   * IT RISES. The gaps between clicks are already widening - that is the
   * deceleration - and a pitch that climbs alongside is what makes the widening
   * read as ARRIVING somewhere rather than as running out of momentum. Straight
   * off the reel's own progress, so the two can never drift apart.
   *
   * @param {number} t  0..1, how far through the spin this tick is
   */
  boxTick(t = 0) {
    const k = Math.max(0, Math.min(1, t));
    this.noise({ t: 0.012, v: 0.13, f: 5200, mode: 'highpass' });
    this.tone({ f: 900 + k * 620, t: 0.03, type: 'square', v: 0.09 });
  }

  // THE REEL LANDS. The one moment the box is allowed to be loud.
  //
  // It is the upgrade chime opened out: the same three ascending partials, but
  // spread over twice the time, with a noise swell underneath that arrives
  // BEFORE the first note. The swell is what makes it feel like the flash and
  // the shockwave rather than like a chime that happens to coincide with them.
  boxReveal() {
    this.noise({ t: 0.3, v: 0.26, f: 300, f2: 4200, mode: 'bandpass', q: 1.2 });
    this.tone({ f: 110, f2: 55, t: 0.5, type: 'sine', v: 0.34 });
    this.tone({ f: 523, f2: 1046, t: 0.24, type: 'triangle', v: 0.3, delay: 0.06 });
    this.tone({ f: 784, f2: 1568, t: 0.3, type: 'sine', v: 0.26, delay: 0.16 });
    this.tone({ f: 1046, f2: 2093, t: 0.4, type: 'sine', v: 0.22, delay: 0.28 });
    this.tone({ f: 1568, t: 0.3, type: 'triangle', v: 0.1, delay: 0.28 });
  }

  // One second nearer to losing it. Three of these play, at three, two and one,
  // and they are the same blip getting more insistent - so the player learns
  // what the sound means on the first roll where they nearly missed one.
  boxWarn() {
    this.tone({ f: 780, t: 0.05, type: 'square', v: 0.14 });
    this.tone({ f: 1170, t: 0.06, type: 'sine', v: 0.1, delay: 0.04 });
  }

  // The lid coming down on an item nobody took. A DOOR, not a failure: the roll
  // is gone but the box is not, and it will sell another the moment this
  // finishes - so it lands rather than droops, and there is no minor third
  // anywhere in it.
  boxClose() {
    this.noise({ t: 0.09, v: 0.24, f: 1400, f2: 200, mode: 'lowpass' });
    this.tone({ f: 200, f2: 90, t: 0.16, type: 'square', v: 0.2 });
    this.tone({ f: 70, t: 0.22, type: 'sine', v: 0.22, delay: 0.02 });
  }

  // An item taken. The upgrade chime with a mechanical seat under it, so it
  // reads as the same KIND of event as taking a totem while still saying that
  // something has been LOADED rather than learned.
  itemTake() {
    this.tone({ f: 330, f2: 660, t: 0.22, type: 'triangle', v: 0.24 });
    this.tone({ f: 495, f2: 990, t: 0.26, type: 'sine', v: 0.2, delay: 0.08 });
    this.noise({ t: 0.12, v: 0.16, f: 1800 });
  }

  // THE ITEM IS CHARGED. Two clean partials a fifth apart, short and quiet.
  //
  // It lands MID-FIGHT, which is the whole design brief: it has to cut through
  // a firefight without being mistaken for a pickup, and it has to be small
  // enough to hear forty times a run without becoming a nuisance. So it is
  // pitched above everything the guns and the enemies occupy, it carries no
  // noise layer at all - noise is what every violent sound in this game is made
  // of - and it is over in a fifth of a second.
  // THE CHARGE ARRIVING. Louder than it was, and it needed to be: this fires
  // once, in the middle of a firefight, over the gun and the track, and it is
  // the only thing that says a button the player has been waiting on is live.
  // A cue nobody hears is a cue that is not there - and unlike the orb blip
  // there is no risk of fatigue, because it plays at most once per cooldown.
  itemReady() {
    this.tone({ f: 1320, t: 0.08, type: 'sine', v: 0.34 });
    this.tone({ f: 1980, t: 0.13, type: 'sine', v: 0.28, delay: 0.06 });
    // A triangle on the top note, for the reason the coin has one: harmonics
    // above the fundamental buy CARRY, where more gain on a sine just buys a
    // louder sine that the mix still swallows.
    this.tone({ f: 1980, t: 0.1, type: 'triangle', v: 0.12, delay: 0.06 });
  }

  // The item spent. A short downward thump with a click on the front - the
  // sound of a charge leaving, deliberately unlike the rising one that said it
  // had arrived.
  itemUse() {
    this.noise({ t: 0.06, v: 0.24, f: 2600 });
    this.tone({ f: 660, f2: 220, t: 0.18, type: 'triangle', v: 0.26 });
    this.tone({ f: 165, f2: 110, t: 0.24, type: 'sine', v: 0.2, delay: 0.03 });
  }

  denied() {
    this.tone({ f: 160, f2: 90, t: 0.12, type: 'square', v: 0.22 });
  }

  // ---- THE MENUS ---------------------------------------------------------
  //
  // THREE VOICES, and they are the quietest things in this file on purpose.
  // They fire on hover, which means they fire while the player is doing
  // nothing but looking around a screen - a cursor dragged across the settings
  // list plays a dozen of these in a second, and anything with body to it
  // becomes a rattle by the third one. They are ticks: short enough to read as
  // the interface acknowledging the cursor rather than as a sound.
  //
  // They are also the only sounds in the game that play with the run stopped,
  // so they have nothing to sit under and can afford to be small.

  // MOVING ONTO A CONTROL. One clean blip, no tail. The pad's focus driver and
  // the mouse's hover both land here, because they are the same event: the
  // selection is now on this thing.
  menuMove() {
    this.tone({ f: 880, t: 0.035, type: 'square', v: 0.1 });
    this.noise({ t: 0.02, v: 0.05, f: 5200 });
  }

  // PRESSING ONE. Up, because the press is the player committing - and short,
  // because most of these open another screen that has its own voice.
  menuSelect() {
    this.tone({ f: 660, f2: 1180, t: 0.07, type: 'square', v: 0.16 });
    this.tone({ f: 1320, t: 0.05, type: 'sine', v: 0.1, delay: 0.05 });
  }

  // BACKING OUT. The same gesture pointing the other way, which is the whole
  // reason it is a third sound and not the second one again: a screen closing
  // and a screen opening must not sound alike, or the player stops hearing
  // either.
  menuBack() {
    this.tone({ f: 620, f2: 330, t: 0.09, type: 'square', v: 0.14 });
  }

  // ---- ACTIVE ITEM VOICES ------------------------------------------------
  //
  // itemUse() above still plays for EVERY item, and these are laid on top of
  // it rather than instead of it. That split is deliberate: the thump is the
  // charge leaving, which is the same event whatever was in the slot, and it
  // is what makes a press feel like a press even for an item whose payload
  // happens somewhere the player is not looking. What follows is the payload.
  //
  // NONE OF THEM IS LONGER THAN A THIRD OF A SECOND except where the item
  // itself is - SIX CHAMBERS' spin and EVENT HORIZON's collapse. Anything
  // longer overlaps the next gunshot, and the gun has to win.

  // Anything that goes off. Body first, then the crack, then the tail - a
  // blast whose noise burst leads sounds like a snare.
  itemBlast() {
    this.tone({ f: 130, f2: 44, t: 0.4, type: 'sine', v: 0.4 });
    this.noise({ t: 0.28, v: 0.36, f: 1600, f2: 200, mode: 'lowpass' });
    this.noise({ t: 0.5, v: 0.16, f: 500, f2: 90, delay: 0.05 });
  }

  // Healing, and the cleanse. Warm and rising, with no noise in it at all -
  // every hostile sound in the game has grit, so the absence of it is what
  // says this one is on your side.
  itemHeal2() {
    this.tone({ f: 420, f2: 700, t: 0.26, type: 'sine', v: 0.26 });
    this.tone({ f: 630, f2: 1050, t: 0.3, type: 'triangle', v: 0.14, delay: 0.05 });
  }

  // Something put on the floor. A mechanical clunk and a latch - it has to
  // sound like an object being SET DOWN, because the player needs to know the
  // charge became a thing in the world rather than an effect on them.
  itemDeploy() {
    this.noise({ t: 0.05, v: 0.3, f: 3000 });
    this.tone({ f: 240, f2: 180, t: 0.12, type: 'square', v: 0.22 });
    this.tone({ f: 700, t: 0.06, type: 'square', v: 0.12, delay: 0.08 });
  }

  // A buff opening. Short rising pair, no body: it must not be mistakable for
  // an explosion happening off-screen.
  itemSurge() {
    this.tone({ f: 520, f2: 1040, t: 0.18, type: 'triangle', v: 0.2 });
    this.tone({ f: 780, f2: 1560, t: 0.14, type: 'sine', v: 0.12, delay: 0.04 });
  }

  // RED MIST. The one buff that costs something, so it goes DOWN into a growl
  // where the others go up.
  itemFrenzy() {
    this.tone({ f: 300, f2: 120, t: 0.3, type: 'sawtooth', v: 0.26 });
    this.tone({ f: 75, t: 0.36, type: 'square', v: 0.18, delay: 0.02 });
    this.noise({ t: 0.2, v: 0.14, f: 900, mode: 'bandpass', q: 3 });
  }

  // BLOOD TAX and OPEN VEIN: health leaving. A wet thud with a low bend under
  // it - the same shape as being hurt, because it is.
  itemPact() {
    this.tone({ f: 210, f2: 70, t: 0.3, type: 'triangle', v: 0.3 });
    this.noise({ t: 0.16, v: 0.2, f: 700, mode: 'lowpass' });
  }

  // JACOB'S LADDER. Five clicks up a scale under one bright crack, so the ear
  // hears the same CHAIN the eye is watching walk through the crowd.
  itemArc() {
    this.noise({ t: 0.1, v: 0.3, f: 6000, mode: 'highpass' });
    for (let i = 0; i < 5; i++) {
      this.tone({
        f: 900 * Math.pow(1.22, i), t: 0.05, type: 'square',
        v: 0.14, delay: i * 0.045,
      });
    }
  }

  // LAST RITES. A bell, low and single. It is the only sound in the game for
  // an event that is already over by the time it plays.
  itemRites() {
    this.tone({ f: 165, t: 0.7, type: 'sine', v: 0.3 });
    this.tone({ f: 247, t: 0.6, type: 'sine', v: 0.16, delay: 0.02 });
    this.tone({ f: 494, t: 0.4, type: 'triangle', v: 0.08, delay: 0.04 });
  }

  // SIX CHAMBERS. The cylinder itself is drawn per click by the item's tick;
  // this is the spin-up under it.
  itemSpin() {
    this.noise({ t: 0.5, v: 0.16, f: 2200, f2: 700, mode: 'bandpass', q: 2 });
    this.tone({ f: 300, f2: 190, t: 0.5, type: 'square', v: 0.1 });
  }

  // EVENT HORIZON. A long fall with nothing bright in it - every other voice
  // here has a crack on the front, and this one deliberately has no attack at
  // all, because the thing it announces arrives by taking something away.
  itemSuck() {
    this.tone({ f: 620, f2: 40, t: 0.9, type: 'sine', v: 0.32 });
    this.tone({ f: 310, f2: 28, t: 1.0, type: 'triangle', v: 0.18, delay: 0.04 });
    this.noise({ t: 0.8, v: 0.14, f: 1800, f2: 120, mode: 'lowpass' });
  }

  // APIARY. Two detuned sawtooths a hair apart - the beat frequency between
  // them IS the buzz, which is cheaper and far more convincing than trying to
  // shape one.
  itemSwarm() {
    this.tone({ f: 210, f2: 260, t: 0.5, type: 'sawtooth', v: 0.12 });
    this.tone({ f: 217, f2: 268, t: 0.5, type: 'sawtooth', v: 0.12 });
    this.tone({ f: 640, f2: 900, t: 0.2, type: 'triangle', v: 0.08, delay: 0.1 });
  }

  // FALLING SKY. A long approaching whistle, because the rocks themselves are
  // silent until they land and the item needs to announce three seconds of
  // something coming.
  itemSky() {
    this.noise({ t: 0.9, v: 0.2, f: 400, f2: 3000, mode: 'bandpass', q: 4 });
    this.tone({ f: 110, f2: 70, t: 0.8, type: 'sine', v: 0.2 });
  }

  // BOOTSTRAP. A hiss with a thump under it, going UP - the only rising
  // noise sweep in the set, which is what makes it read as thrust.
  itemBoot() {
    this.noise({ t: 0.35, v: 0.3, f: 600, f2: 4000, mode: 'bandpass', q: 1.5 });
    this.tone({ f: 90, f2: 220, t: 0.3, type: 'square', v: 0.24 });
  }

  // COLD SPOT. Out and back in: two short bursts with a gap of nothing
  // between them, which is the only way a teleport sounds like a teleport.
  itemBlink() {
    this.tone({ f: 1200, f2: 300, t: 0.1, type: 'sine', v: 0.24 });
    this.tone({ f: 300, f2: 1400, t: 0.12, type: 'sine', v: 0.24, delay: 0.13 });
    this.noise({ t: 0.08, v: 0.16, f: 4000, mode: 'highpass', delay: 0.13 });
  }

  // BONESAW. Grit and a rising body, cut short - the dash is 0.4s and the
  // sound must not still be going when the player has stopped.
  itemCharge() {
    this.noise({ t: 0.22, v: 0.26, f: 1200, f2: 3200, mode: 'bandpass', q: 2 });
    this.tone({ f: 180, f2: 420, t: 0.2, type: 'sawtooth', v: 0.2 });
  }

  // LANCE. One long bright lance of a sound, with the body arriving under it
  // a beat late so the shot reads as bigger than the gun that fired it.
  itemLance() {
    this.tone({ f: 1600, f2: 400, t: 0.35, type: 'sawtooth', v: 0.3 });
    this.noise({ t: 0.3, v: 0.3, f: 5000, f2: 800, mode: 'bandpass', q: 1.5 });
    this.tone({ f: 120, f2: 55, t: 0.45, type: 'sine', v: 0.3, delay: 0.04 });
  }

  // GRAFT. The only permanent thing in the pool, so it is the only voice that
  // resolves upward onto a held note rather than decaying off one.
  itemGraft() {
    this.tone({ f: 392, t: 0.16, type: 'sine', v: 0.22 });
    this.tone({ f: 523, t: 0.16, type: 'sine', v: 0.22, delay: 0.1 });
    this.tone({ f: 784, t: 0.5, type: 'triangle', v: 0.18, delay: 0.2 });
  }

  // BANDOLIER. Rounds going INTO something: a short rattle of brass with a
  // seated clunk under it. Deliberately the reload's vocabulary rather than the
  // pickup chime's - what the player just did is load the gun, not find a box.
  itemAmmo() {
    for (let i = 0; i < 4; i++) {
      this.noise({ t: 0.03, v: 0.16, f: 5200, mode: 'highpass', delay: i * 0.035 });
    }
    this.tone({ f: 300, f2: 210, t: 0.14, type: 'square', v: 0.2, delay: 0.05 });
    this.tone({ f: 150, t: 0.16, type: 'sine', v: 0.18, delay: 0.06 });
  }

  // ORGAN GRINDER, thrown. A wind-up: a ratchet made of six quick clicks over a
  // rising body, so the thing is audibly WOUND before it lands and starts
  // playing. Nothing else in the set ratchets, which is what makes it findable
  // by ear in a crowded frame.
  itemMonkeyThrow() {
    for (let i = 0; i < 6; i++) {
      this.tone({
        f: 2200 + i * 180, t: 0.02, type: 'square', v: 0.1, delay: i * 0.038,
      });
    }
    this.tone({ f: 140, f2: 260, t: 0.3, type: 'triangle', v: 0.2 });
  }

  /**
   * ONE CLASH OF THE CYMBALS, and the only sound in the game that is a MUSICAL
   * INSTRUMENT rather than a machine or a body. That is the whole brief: it
   * lands on Music.pulse, so it arrives in time with the track, and it has to
   * be recognisable as a thing playing along rather than as another explosion
   * happening off screen.
   *
   * Two bandpassed noise bursts a hair apart is a crash cymbal - the beat
   * between the two filters is what gives it the shimmer a single burst has
   * no way to fake - with a short metallic partial on top for the strike.
   *
   * @param {number} urgency  0 at the throw, 1 as the fuse runs out. It opens
   *   the filter and lifts the level, so the toy audibly panics: the player can
   *   tell how long is left with their back turned.
   */
  monkey(urgency = 0) {
    const u = Math.max(0, Math.min(1, urgency));
    const v = 0.14 + u * 0.16;
    this.noise({ t: 0.26 + u * 0.1, v, f: 3600 + u * 2600, mode: 'bandpass', q: 1.1 });
    this.noise({ t: 0.2, v: v * 0.7, f: 5200 + u * 2600, mode: 'bandpass', q: 0.8 });
    this.tone({ f: 1720, f2: 1450, t: 0.09, type: 'square', v: 0.07 + u * 0.06 });
  }

  // THE LAMPREY FINISHING SOMETHING. Wet and small - it is a 30cm animal, and a
  // pet whose kill sounded like the player's gun would be a pet stealing the
  // frame. The rise on the tail is the heal; nothing hostile in this game
  // resolves upward.
  lamprey() {
    this.noise({ t: 0.09, v: 0.16, f: 900, f2: 260, mode: 'lowpass' });
    this.tone({ f: 260, f2: 520, t: 0.16, type: 'sine', v: 0.18, delay: 0.03 });
  }

  // LITTLE BROTHER'S shot. Deliberately thinner and higher than the player's
  // own gun: two guns firing in one room have to be tellable apart, and the
  // one the player is not holding is the one that gives way.
  turret() {
    this.tone({ f: 900, f2: 500, t: 0.05, type: 'square', v: 0.1 });
    this.noise({ t: 0.04, v: 0.08, f: 3500, mode: 'highpass' });
  }
  credits() {
    this.tone({ f: 1180, t: 0.04, v: 0.14, type: 'sine' });
  }

  // A MONEY ORB COLLECTED. Bubbly rather than metallic: three tuned partials
  // gliding up a fifth, no noise layer at all, because this is the most-played
  // sound in the game and a noise layer on it becomes unbearable by wave five.
  //
  // The BRIGHTNESS is bought in harmonics rather than in gain. The obvious way
  // to make a blip carry is to turn it up, and past a point that just makes a
  // louder thud; adding a triangle a fifth above and a short sine two octaves
  // over it puts energy where the ear is most sensitive, so the orb cuts
  // through the track at a level that still leaves room for the gun.
  //
  // Three things stop a stream of them turning into a wall of noise:
  //   1. A hard throttle. Orbs arrive several per frame during the wave-clear
  //      vacuum; anything inside COIN_GAP of the last one is simply dropped.
  //   2. A rising ladder. Consecutive pickups climb a pentatonic scale and
  //      wrap an octave up, so a sweep across the floor plays as a run rather
  //      than as the same blip forty times.
  //   3. A reset. Half a second of silence drops the ladder back to the
  //      bottom, so a single orb picked up in isolation always sounds the
  //      same, and only an actual chain climbs.
  // The small random detune on top is what keeps two orbs collected in the
  // same breath from sounding like one doubled sample.
  coin() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    if (now - this._coinAt < COIN_GAP) return;
    this._coinStep = now - this._coinAt > COIN_RESET ? 0 : this._coinStep + 1;
    this._coinAt = now;
    const step = this._coinStep % COIN_LADDER.length;
    const oct = Math.min(2, Math.floor(this._coinStep / COIN_LADDER.length));
    const f = COIN_LADDER[step] * Math.pow(2, oct) * (0.985 + Math.random() * 0.03);
    // The glide is what makes it a bubble instead of a beep: it arrives from
    // under the note rather than starting on it.
    this.tone({ f: f * 0.62, f2: f, t: 0.09, type: 'sine', v: 0.3 });
    // THE SPARKLE, and the reason the whole sound reads as brighter rather
    // than merely louder. A pure sine an octave up is felt as volume; a
    // triangle has odd harmonics above it, so the same note arrives with an
    // edge on it and the blip carries over a full arena without having to be
    // pushed further up the meter.
    this.tone({ f: f * 1.5, f2: f * 2, t: 0.06, type: 'triangle', v: 0.12, delay: 0.02 });
    // And a third, brief and very quiet, two octaves up. Short enough (30ms)
    // to read as the attack of the note rather than as a note of its own,
    // which is what keeps a chain of forty of these from turning shrill.
    this.tone({ f: f * 3, t: 0.03, type: 'sine', v: 0.06, delay: 0.01 });
  }
  // The magnet. A rising sweep with a soft thump under it - the sound of the
  // floor being pulled in, played once for however many orbs answer it. The
  // orb blips that follow are the payoff, so this deliberately does not
  // compete with them: it opens the moment rather than filling it.
  pickupMagnet() {
    this.tone({ f: 180, f2: 900, t: 0.28, type: 'sine', v: 0.26 });
    this.tone({ f: 90, f2: 60, t: 0.22, type: 'triangle', v: 0.18 });
    this.noise({ t: 0.3, v: 0.1, f: 1400, delay: 0.04 });
  }
  pickupShield() {
    this.tone({ f: 330, f2: 660, t: 0.2, type: 'sine', v: 0.3 });
    this.noise({ t: 0.3, v: 0.15, f: 2000 });
    this.tone({ f: 990, f2: 1980, t: 0.25, type: 'triangle', v: 0.2, delay: 0.1 });
  }
}