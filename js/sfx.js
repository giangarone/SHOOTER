// WebAudio synth. Every sound is generated from oscillators and noise buffers
// at call time - there are no audio assets. Nodes are one-shot and get
// collected once they finish playing.
//
// All the named sounds below (shoot, kill, pickupAmmo, ...) are just recipes
// over tone() and noise(). Powerups reference them by name: the `sfx` string on
// a pickup type in powerups.js must match a method here.

export class SFX {
  constructor() {
    this.ctx = null;
    this.master = null;
    // Only used to time the reload's final click. Must match
    // Player.reloadTime in player.js.
    this.reloadDur = 1.4;
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
      this.master.gain.value = 0.22;
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
  denied() {
    this.tone({ f: 160, f2: 90, t: 0.12, type: 'square', v: 0.22 });
  }
  credits() {
    this.tone({ f: 1180, t: 0.04, v: 0.14, type: 'sine' });
  }
  pickupShield() {
    this.tone({ f: 330, f2: 660, t: 0.2, type: 'sine', v: 0.3 });
    this.noise({ t: 0.3, v: 0.15, f: 2000 });
    this.tone({ f: 990, f2: 1980, t: 0.25, type: 'triangle', v: 0.2, delay: 0.1 });
  }
}