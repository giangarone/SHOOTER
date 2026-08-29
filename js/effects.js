// Visual effects: particles, bullet tracers, muzzle flash, screen shake.
//
// Everything here is pre-allocated and recycled. No effect ever creates a
// scene object at runtime, because effects fire dozens of times per second.
//   - particles: one THREE.Points with MAX slots, written through a ring
//     buffer. An overflowing burst overwrites the oldest particles.
//   - tracers: a small fixed pool of lines, reusing the first free one.
//   - shockwave rings: the same pool trick with flat discs, scaled and faded.
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

    // Shockwave rings: a small fixed pool of flat discs, scaled outward and
    // faded on use. Same reasoning as the tracers - melee fires often enough
    // that building a ring per swing would churn geometry every second.
    // Unit-radius so a caller's range in metres is just the target scale.
    this.rings = [];
    const ringGeom = new THREE.RingGeometry(0.82, 1, 40);
    for (let i = 0; i < 4; i++) {
      const m = new THREE.MeshBasicMaterial({
        color: 0xff3b30,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(ringGeom, m);
      // Flat on the floor, lifted just clear of it so it does not z-fight.
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      mesh.frustumCulled = false;
      scene.add(mesh);
      this.rings.push({ mesh, life: 0, maxLife: 0.28, radius: 1 });
    }

    // TELEGRAPH MARKS. Ground markers for attacks that announce themselves
    // before they land - a mortar's impact circle, a boss's charge lane.
    //
    // A separate pool from the shockwave rings for two reasons. The ring pool
    // is four deep and shockwave() steals rings[0] when they are all busy, so
    // a telegraph drawn through it would be silently cut short by the next
    // melee swing - the one failure a telegraph must never have. And a ring is
    // fire-and-forget while a mark lives for as long as its owner says: these
    // are ACQUIRED and RELEASED, and update() leaves them alone in between.
    //
    // The materials copy the ring material's parameters exactly so three.js
    // reuses that shader program rather than compiling a new one.
    this.marks = [];
    const markDisc = new THREE.CircleGeometry(1, 32);
    const markRing = new THREE.RingGeometry(0.9, 1, 40);
    // Unit square, scaled to the corridor's width and length. It uses the
    // ring's material rather than the disc's so a lane is as bright as an
    // impact circle's outline - a faint corridor is not a warning.
    const markLane = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < 10; i++) {
      const mk = new THREE.Group();
      const dm = new THREE.MeshBasicMaterial({
        color: 0xff3b30, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      });
      const rm = new THREE.MeshBasicMaterial({
        color: 0xff3b30, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      });
      const discMesh = new THREE.Mesh(markDisc, dm);
      const ringMesh = new THREE.Mesh(markRing, rm);
      // A LANE needs its own mesh. Stretching the disc and ring along one axis
      // gives an ellipse, which reads as "something is happening over there"
      // rather than as the straight corridor a charge is about to come down -
      // the one thing the telegraph has to communicate. So a slot carries both
      // shapes and shows whichever the caller asked for.
      const lane = new THREE.Mesh(markLane, rm);
      lane.visible = false;
      mk.add(discMesh, ringMesh, lane);
      mk.rotation.x = -Math.PI / 2;
      mk.position.y = 0.06;
      mk.visible = false;
      mk.frustumCulled = false;
      scene.add(mk);
      // `disc` and `ring` are the MATERIALS - colour and opacity are written
      // through them. The meshes are kept separately because the lane SHARES
      // the ring material, so toggling visibility on the material would hide
      // the lane along with the ring.
      this.marks.push({
        group: mk, disc: dm, ring: rm,
        discMesh, ringMesh, lane, shape: '', used: false,
      });
    }

    // BEAMS. One-frame lines, redrawn every frame by whatever owns them -
    // a conduit's links to the enemies it is buffing. Same shape as the
    // tracer pool, and cleared at the top of every update().
    this.beams = [];
    for (let i = 0; i < 8; i++) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const m = new THREE.LineBasicMaterial({ color: 0x00e5b0, transparent: true, opacity: 0.5 });
      const line = new THREE.Line(g, m);
      line.visible = false;
      line.frustumCulled = false;
      scene.add(line);
      this.beams.push(line);
    }
    this._beamCount = 0;

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

  // An expanding ring on the floor at `p`, growing to `radius` metres. Used to
  // show the area a melee swing covered; deliberately faint, since it fires on
  // every swing and a bright flash at the player's feet would read as damage
  // taken rather than damage dealt.
  shockwave(p, color = 0xff3b30, radius = 3, life = 0.28) {
    let r = this.rings[0];
    for (const cand of this.rings) {
      if (cand.life <= 0) {
        r = cand;
        break;
      }
    }
    r.mesh.position.set(p.x, p.y + 0.08, p.z);
    r.mesh.material.color.setHex(color);
    r.mesh.scale.setScalar(0.001);
    r.mesh.visible = true;
    r.radius = radius;
    r.maxLife = life;
    r.life = life;
  }

  // Claim a telegraph slot. Returns a handle to pass to markSet/markRelease,
  // or -1 when every slot is busy - a caller that gets -1 must still work,
  // just without its warning drawn.
  markAcquire() {
    for (let i = 0; i < this.marks.length; i++) {
      if (!this.marks[i].used) {
        this.marks[i].used = true;
        this.marks[i].group.visible = true;
        return i;
      }
    }
    return -1;
  }

  /**
   * Position and fill a telegraph. Call it every frame the warning is up.
   *
   * @param {number} fill 0..1 of the way to detonation. The outline is visible
   *   from the start so the AREA reads immediately; the disc fills behind it
   *   so the TIMING reads as it goes.
   */
  markSet(h, x, z, radius, color, fill, aspect = 1, rot = 0) {
    if (h < 0) return;
    const mk = this.marks[h];
    mk.group.position.set(x, 0.06, z);
    // `aspect` of 1 is a circular impact marker; anything else is a LANE, which
    // swaps in the rectangular meshes. The group already lies flat via a -90
    // degree turn about X, which maps its local +y onto world -z; a spin about
    // local z after that therefore turns it within the floor plane, and
    // rot = atan2(-dx, -dz) points the long axis down (dx, dz).
    const shape = aspect === 1 ? 'disc' : 'lane';
    if (mk.shape !== shape) {
      mk.shape = shape;
      const isLane = shape === 'lane';
      mk.discMesh.visible = !isLane;
      mk.ringMesh.visible = !isLane;
      mk.lane.visible = isLane;
    }
    mk.group.scale.set(
      Math.max(0.001, radius * (shape === 'lane' ? 2 : 1)),
      Math.max(0.001, radius * aspect * (shape === 'lane' ? 2 : 1)),
      1
    );
    mk.group.rotation.z = rot;
    mk.disc.color.setHex(color);
    mk.ring.color.setHex(color);
    mk.disc.opacity = 0.05 + fill * 0.3;
    mk.ring.opacity = 0.35 + fill * 0.45;
  }

  markRelease(h) {
    if (h < 0) return;
    this.marks[h].used = false;
    this.marks[h].shape = '';
    this.marks[h].group.visible = false;
  }

  // A line from `a` to `b` for THIS frame only. Callers redraw every frame;
  // update() hides whatever was not claimed.
  beam(a, b, color) {
    if (this._beamCount >= this.beams.length) return;
    const line = this.beams[this._beamCount++];
    const pos = line.geometry.attributes.position;
    pos.setXYZ(0, a.x, a.y + 0.9, a.z);
    pos.setXYZ(1, b.x, b.y + 0.9, b.z);
    pos.needsUpdate = true;
    line.material.color.setHex(color);
    line.visible = true;
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
    // Beams are redrawn from scratch each frame, so anything not claimed since
    // the last update belongs to an owner that is gone.
    for (let i = this._beamCount; i < this.beams.length; i++) this.beams[i].visible = false;
    this._beamCount = 0;
    this.shakeAmp *= Math.pow(0.01, dt);
    if (this.shakeAmp < 0.002) this.shakeAmp = 0;
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.flashLight.intensity = 0;
    }
    for (const r of this.rings) {
      if (r.life <= 0) continue;
      r.life -= dt;
      if (r.life <= 0) {
        r.mesh.visible = false;
        continue;
      }
      // Ease-out on the way out, so the wave reads as a snap rather than a
      // steady creep, and fade over the whole life.
      const t = 1 - r.life / r.maxLife;
      const e = 1 - Math.pow(1 - t, 3);
      r.mesh.scale.setScalar(Math.max(0.001, r.radius * e));
      r.mesh.material.opacity = 0.5 * (1 - t);
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