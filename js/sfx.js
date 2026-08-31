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

  // One burst of lowpassed white noise, fading out over its length.
  // f is the filter cutoff here, not a pitch.
  noise({ t = 0.1, v = 0.5, f = 1000, delay = 0 }) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * t));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const flt = this.ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = f;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(v, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + t);
    src.connect(flt);
    flt.connect(g);
    g.connect(this.master);
    src.start(now);
  }

  // ---- named sounds ----
  shoot() {
    this.noise({ t: 0.09, v: 0.5, f: 2600 });
    this.tone({ f: 180, f2: 60, t: 0.08, type: 'square', v: 0.25 });
  }
  hit() {
    this.tone({ f: 880, f2: 440, t: 0.06, type: 'triangle', v: 0.3 });
  }
  kill() {
    this.noise({ t: 0.25, v: 0.5, f: 900 });
    this.tone({ f: 220, f2: 40, t: 0.3, type: 'sawtooth', v: 0.3 });
  }
  hurt() {
    this.tone({ f: 110, f2: 55, t: 0.25, type: 'sawtooth', v: 0.45 });
  }
  reload() {
    this.tone({ f: 300, t: 0.05, v: 0.3 });
    this.tone({ f: 420, t: 0.05, v: 0.3, delay: 0.12 });
    this.tone({ f: 560, t: 0.06, v: 0.35, delay: this.reloadDur - 0.1 });
  }
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
  // The Devil arriving. A low descending pair under a dull thud - deliberately
  // not a sting: he is announced by being there, and a fanfare would make the
  // wave break feel like a cutscene.
  devil() {
    this.tone({ f: 110, f2: 42, t: 0.9, type: 'sawtooth', v: 0.16 });
    this.tone({ f: 74, f2: 30, t: 1.1, type: 'sine', v: 0.2, delay: 0.05 });
    this.noise({ t: 0.5, v: 0.1, f: 220, delay: 0.02 });
  }

  // A deal struck. The upgrade chime with the bottom knocked out of it, so it
  // reads as the same KIND of event as taking a totem and never as a good one.
  deal() {
    this.tone({ f: 220, f2: 110, t: 0.32, type: 'square', v: 0.2 });
    this.tone({ f: 55, f2: 44, t: 0.55, type: 'sawtooth', v: 0.22, delay: 0.02 });
    this.noise({ t: 0.25, v: 0.14, f: 500 });
  }

  denied() {
    this.tone({ f: 160, f2: 90, t: 0.12, type: 'square', v: 0.22 });
  }
  credits() {
    this.tone({ f: 1180, t: 0.04, v: 0.14, type: 'sine' });
  }

  // A MONEY ORB COLLECTED. Bubbly rather than metallic: two sines gliding up a
  // fifth, no noise layer at all, because this is the most-played sound in the
  // game and anything with an edge on it becomes unbearable by wave five.
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
    this.tone({ f: f * 0.62, f2: f, t: 0.09, type: 'sine', v: 0.22 });
    this.tone({ f: f * 1.5, f2: f * 2, t: 0.06, type: 'sine', v: 0.07, delay: 0.02 });
  }
  pickupShield() {
    this.tone({ f: 330, f2: 660, t: 0.2, type: 'sine', v: 0.3 });
    this.noise({ t: 0.3, v: 0.15, f: 2000 });
    this.tone({ f: 990, f2: 1980, t: 0.25, type: 'triangle', v: 0.2, delay: 0.1 });
  }
}