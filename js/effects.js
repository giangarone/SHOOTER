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

// Points along a homing tracer. Enough that the bend reads as a curve rather
// than as two straight lines meeting at an angle.
const ARC_SEGMENTS = 12;
// How long a homing arc stays up. Longer than a straight tracer's 0.07s: the
// curve is the whole message and it has to survive long enough to be seen.
const ARC_LIFE = 0.14;

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

// Ground texture for CREEP - the persistent stain a lingering zone leaves on
// the floor. White with an alpha falloff so a single copy can be tinted per
// zone; the blobs give it a ragged edge, because a clean circle reads as a UI
// marker and this has to read as something spilled.
export function makeCreepTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const ctx = cv.getContext('2d');
  const R = 64;

  const base = ctx.createRadialGradient(R, R, R * 0.1, R, R, R);
  base.addColorStop(0, 'rgba(255,255,255,0.90)');
  base.addColorStop(0.5, 'rgba(255,255,255,0.55)');
  base.addColorStop(0.82, 'rgba(255,255,255,0.26)');
  base.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 128, 128);

  // Irregular density so the middle looks pooled rather than airbrushed.
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = R * (0.3 + Math.random() * 0.52);
    const r = R * (0.1 + Math.random() * 0.19);
    const x = R + Math.cos(a) * d;
    const y = R + Math.sin(a) * d;
    const blob = ctx.createRadialGradient(x, y, 0, x, y, r);
    blob.addColorStop(0, 'rgba(255,255,255,0.30)');
    blob.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = blob;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Fade the outer edge to nothing. The decal turns slowly, and without this
  // the square corners of the canvas would sweep visibly round the zone.
  ctx.globalCompositeOperation = 'destination-in';
  const mask = ctx.createRadialGradient(R, R, R * 0.55, R, R, R);
  mask.addColorStop(0, 'rgba(255,255,255,1)');
  mask.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = mask;
  ctx.fillRect(0, 0, 128, 128);

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

    // ARCS. Curved tracers for shots that homed onto a target. Same pooling as
    // the straight tracers, but each is a polyline rather than a segment,
    // because the curve IS the feedback: without seeing the bend, a player
    // whose crosshair was off would just see a miss register as a hit and have
    // no idea why. They also live twice as long as a straight tracer - four
    // frames is enough to read a line and not enough to read a shape.
    this.arcs = [];
    for (let i = 0; i < 6; i++) {
      const g = new THREE.BufferGeometry();
      g.setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array((ARC_SEGMENTS + 1) * 3), 3)
      );
      const m = new THREE.LineBasicMaterial({ color: 0xff5fd2, transparent: true, opacity: 0 });
      const line = new THREE.Line(g, m);
      line.visible = false;
      line.frustumCulled = false;
      scene.add(line);
      this.arcs.push({ line, life: 0 });
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

    // CREEP. The persistent ground stain under a lingering zone - an ash
    // cloud, a pool of blight. A separate pool from the telegraph marks for
    // two reasons: marks are ten deep and transient, while creep is held for
    // the whole life of a zone and there can be twelve of those at once, so
    // sharing would starve the telegraphs. And creep is meant to look like
    // terrain rather than like an instruction.
    //
    // Each zone gets a textured blotch that turns slowly, plus a hard rim at
    // the exact damage radius. The blotch says "this ground is wrong"; the rim
    // says precisely where it stops - particles alone gave neither, which is
    // why a zone could be stood in without being noticed.
    this.creepTex = makeCreepTexture();
    this.creep = [];
    for (let i = 0; i < 14; i++) {
      const grp = new THREE.Group();
      const fillMat = new THREE.MeshBasicMaterial({
        map: this.creepTex,
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const rimMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      // The plane is a unit square, so it needs twice the group's scale to
      // span the zone's diameter; the ring is already unit-RADIUS and takes
      // the group scale as it is.
      const fill = new THREE.Mesh(markLane, fillMat);
      fill.scale.set(2, 2, 1);
      const rim = new THREE.Mesh(markRing, rimMat);
      grp.add(fill, rim);
      grp.rotation.x = -Math.PI / 2;
      // Under the telegraph marks at 0.06, so a mortar circle drawn over a
      // pool still reads on top of it.
      grp.position.y = 0.035;
      grp.visible = false;
      grp.frustumCulled = false;
      scene.add(grp);
      this.creep.push({
        group: grp, fill, fillMat, rimMat,
        spin: (Math.random() < 0.5 ? -1 : 1) * (0.12 + Math.random() * 0.16),
        phase: Math.random() * Math.PI * 2,
        used: false,
      });
    }
    this._creepT = 0;

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

  /**
   * A curved tracer from `from` to `to`, leaving along `dir` before bending
   * onto the target. Quadratic bezier with the control point pushed out along
   * the barrel, so the line starts on the player's actual aim and curves from
   * there - which is what makes it read as the shot being corrected rather
   * than as the shot having been fired somewhere else all along.
   */
  arc(from, to, dir) {
    let a = this.arcs[0];
    for (const cand of this.arcs) {
      if (cand.life <= 0) {
        a = cand;
        break;
      }
    }
    const pos = a.line.geometry.attributes.position;
    const d = from.distanceTo(to);
    // Control point: half a shot-length down the original line of fire.
    const cx = from.x + dir.x * d * 0.55;
    const cy = from.y + dir.y * d * 0.55;
    const cz = from.z + dir.z * d * 0.55;
    for (let i = 0; i <= ARC_SEGMENTS; i++) {
      const t = i / ARC_SEGMENTS;
      const u = 1 - t;
      const w0 = u * u;
      const w1 = 2 * u * t;
      const w2 = t * t;
      pos.setXYZ(
        i,
        w0 * from.x + w1 * cx + w2 * to.x,
        w0 * from.y + w1 * cy + w2 * to.y,
        w0 * from.z + w1 * cz + w2 * to.z
      );
    }
    pos.needsUpdate = true;
    a.line.visible = true;
    a.line.material.opacity = 0.95;
    a.life = ARC_LIFE;
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

  // Claim a creep slot for a zone, held until the zone expires. Returns -1
  // when the pool is full, which a caller must survive - the zone still deals
  // its damage, it just goes undecorated.
  creepAcquire() {
    for (let i = 0; i < this.creep.length; i++) {
      if (!this.creep[i].used) {
        this.creep[i].used = true;
        this.creep[i].group.visible = true;
        return i;
      }
    }
    return -1;
  }

  /**
   * Position and tint one zone's ground stain. Call every frame it is alive.
   *
   * @param {number} intensity 0..1. Zones fade theirs down as they expire, so
   *   the floor going clean is the warning that the danger has passed.
   */
  creepSet(h, x, z, radius, color, intensity) {
    if (h < 0) return;
    const c = this.creep[h];
    c.group.position.set(x, 0.035, z);
    c.group.scale.set(Math.max(0.001, radius), Math.max(0.001, radius), 1);
    c.fillMat.color.setHex(color);
    c.rimMat.color.setHex(color);
    const k = Math.max(0, Math.min(1, intensity));
    // The rim breathes and the fill does not. One moving element reads as
    // alive; two competing rhythms just look noisy.
    const pulse = 0.8 + Math.sin(this._creepT * 2.6 + c.phase) * 0.2;
    // Deliberately strong. These are the only warning that a patch of floor is
    // dangerous, and a subtle one is the same as none - the whole reason the
    // particle-only version failed is that it could be stood in unnoticed.
    c.fillMat.opacity = 0.55 * k;
    c.rimMat.opacity = 1.0 * k * pulse;
  }

  creepRelease(h) {
    if (h < 0) return;
    this.creep[h].used = false;
    this.creep[h].group.visible = false;
    this.creep[h].fillMat.opacity = 0;
    this.creep[h].rimMat.opacity = 0;
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
    this._creepT += dt;
    // The stains turn, slowly and each at its own rate, so a zone looks like
    // it is spreading rather than like a decal someone pasted down.
    for (const c of this.creep) {
      if (c.used) c.fill.rotation.z += c.spin * dt;
    }
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
    for (const a of this.arcs) {
      if (a.life > 0) {
        a.life -= dt;
        // Held bright for most of its life and then dropped, rather than faded
        // linearly. A GL line is one pixel wide whatever we ask for, so the
        // only lever on how readable the curve is is how long it stays at full
        // strength - a linear fade spends most of the window half-visible.
        a.line.material.opacity = Math.max(0, Math.min(1, (a.life / ARC_LIFE) * 2.4)) * 0.95;
        if (a.life <= 0) a.line.visible = false;
      }
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