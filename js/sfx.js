export class SFX {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.reloadDur = 1.4;
  }

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
}