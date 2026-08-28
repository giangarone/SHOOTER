// Visual effects: particles, bullet tracers, muzzle flash, screen shake.
//
// Everything here is pre-allocated and recycled. No effect ever creates a
// scene object at runtime, because effects fire dozens of times per second.
//   - particles: one THREE.Points with MAX slots, written through a ring
//     buffer. An overflowing burst overwrites the oldest particles.
//   - tracers: a small fixed pool of lines, reusing the first free one.
//   - flash: a single PointLight, moved and re-lit per shot. It counts toward
//     the scene's fixed light budget (see arena.js).
//
// update() must be called once per frame, including while paused, so effects
// keep settling.

import * as THREE from 'three';

// Particle slots. Bursts beyond this recycle the oldest particles rather than
// growing the buffer.
const MAX = 1024;

// Soft radial white dot, tinted per-use by material colour. Shared by the
// particles, the projectile glows and the pickup glows.
export function makeGlowTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
}

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.glowTex = makeGlowTexture();
    this._initParticles();

    // Tracer pool. Each is a two-vertex line whose endpoints are rewritten on
    // use; frustum culling is off because the endpoints move without the
    // bounding volume being recomputed.
    this.tracers = [];
    for (let i = 0; i < 10; i++) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const m = new THREE.LineBasicMaterial({ color: 0x9ff3ff, transparent: true, opacity: 0 });
      const line = new THREE.Line(g, m);
      line.visible = false;
      line.frustumCulled = false;
      scene.add(line);
      this.tracers.push({ line, life: 0 });
    }

    this.flashLight = new THREE.PointLight(0xffc36b, 0, 7);
    scene.add(this.flashLight);
    this.flashT = 0;
    this.shakeAmp = 0;
  }

  // Parallel typed arrays, one entry per particle slot. `pos` and `col` are
  // uploaded to the GPU each frame; the rest is CPU-side simulation state.
  // A slot is free when life[i] <= 0.
  _initParticles() {
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    this.vel = new Float32Array(MAX * 3);
    this.life = new Float32Array(MAX);
    this.maxLife = new Float32Array(MAX);
    this.c0 = new Float32Array(MAX * 3);
    for (let i = 0; i < MAX; i++) this.pos[i * 3 + 1] = -100;
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    const m = new THREE.PointsMaterial({
      size: 0.15,
      vertexColors: true,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      map: this.glowTex,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
    this.cursor = 0;
    this.alive = 0;
  }

  // Spray `count` particles from point `p`. `up` biases them upward, `life` is
  // seconds (randomised per particle). Particles fade to black as they die.
  burst(p, color, count = 16, speed = 5, up = 2, life = 0.5) {
    const c = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      const idx = this.cursor;
      this.cursor = (this.cursor + 1) % MAX;
      const i3 = idx * 3;
      if (this.life[idx] <= 0) this.alive++;
      this.pos[i3] = p.x;
      this.pos[i3 + 1] = p.y;
      this.pos[i3 + 2] = p.z;
      let vx = Math.random() - 0.5;
      let vy = Math.random() - 0.5 + up * 0.4;
      let vz = Math.random() - 0.5;
      const len = Math.hypot(vx, vy, vz) || 1;
      const s = (speed * (0.4 + Math.random() * 0.9)) / len;
      this.vel[i3] = vx * s;
      this.vel[i3 + 1] = vy * s;
      this.vel[i3 + 2] = vz * s;
      this.life[idx] = this.maxLife[idx] = life * (0.6 + Math.random() * 0.6);
      this.c0[i3] = c.r;
      this.c0[i3 + 1] = c.g;
      this.c0[i3 + 2] = c.b;
    }
  }

  tracer(from, to) {
    let t = this.tracers[0];
    for (const cand of this.tracers) {
      if (cand.life <= 0) {
        t = cand;
        break;
      }
    }
    const a = t.line.geometry.attributes.position;
    a.setXYZ(0, from.x, from.y, from.z);
    a.setXYZ(1, to.x, to.y, to.z);
    a.needsUpdate = true;
    t.line.visible = true;
    t.line.material.opacity = 0.85;
    t.life = 0.07;
  }

  // Relight the muzzle flash at `p`. The light is never added or removed, only
  // moved and dimmed - see the light-count note in arena.js.
  flash(p) {
    this.flashLight.position.copy(p);
    this.flashLight.intensity = 26;
    this.flashT = 0.05;
  }

  // Shake is additive and capped, so many hits at once don't compound into an
  // unreadable screen. It decays exponentially in update().
  addShake(a) {
    this.shakeAmp = Math.min(0.32, this.shakeAmp + a);
  }

  // Random camera offset for this frame, written into `out`. main.js adds it
  // after the player has positioned the camera, so it must be applied every
  // frame or not at all - it is an offset, not a persistent state.
  shakeOffset(out) {
    const s = this.shakeAmp;
    out.set((Math.random() - 0.5) * s, (Math.random() - 0.5) * s * 0.8, (Math.random() - 0.5) * s * 0.4);
    return out;
  }

  update(dt) {
    this.shakeAmp *= Math.pow(0.01, dt);
    if (this.shakeAmp < 0.002) this.shakeAmp = 0;
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.flashLight.intensity = 0;
    }
    for (const t of this.tracers) {
      if (t.life > 0) {
        t.life -= dt;
        t.line.material.opacity = Math.max(0, (t.life / 0.07) * 0.85);
        if (t.life <= 0) t.line.visible = false;
      }
    }
    // Nothing alive means nothing moved, so skip the sweep and the two
    // full-buffer uploads entirely.
    if (this.alive === 0) return;
    const { pos: p, vel: v, life: l, maxLife: ml, col: c, c0 } = this;
    for (let i = 0; i < MAX; i++) {
      if (l[i] <= 0) continue;
      l[i] -= dt;
      const i3 = i * 3;
      if (l[i] <= 0) {
        p[i3 + 1] = -100;
        c[i3] = c[i3 + 1] = c[i3 + 2] = 0;
        this.alive--;
        continue;
      }
      v[i3 + 1] -= 9.8 * dt * 0.6;
      p[i3] += v[i3] * dt;
      p[i3 + 1] += v[i3 + 1] * dt;
      p[i3 + 2] += v[i3 + 2] * dt;
      const f = l[i] / ml[i];
      c[i3] = c0[i3] * f;
      c[i3 + 1] = c0[i3 + 1] * f;
      c[i3 + 2] = c0[i3 + 2] * f;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}