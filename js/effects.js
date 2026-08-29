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

// LIGHTNING. Joints in one bolt, how high it starts, and how long it hangs
// there. Longer-lived than a tracer by an order of magnitude: a tracer says a
// bullet went somewhere, a bolt is a whole event and has to be seen even by a
// player who was looking at the other side of the arena when it landed.
const BOLT_SEGMENTS = 14;
const BOLT_HEIGHT = 18;
const BOLT_LIFE = 0.22;
// Lines drawn per strike. A GL line is one pixel wide however thick it is
// asked to be, so a single polyline eighteen metres long reads as a hair on
// the screen. Three of them, each jittered separately, is what makes a strike
// look like a strike - the thickness is the spread between them.
const BOLT_FORKS = 3;

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

// Ground shapes for CREEP - the persistent patch a lingering zone leaves on
// the floor.
//
// NOT A CIRCLE. A disc with a rim around it reads as a UI marker - a selection
// ring, a spell indicator - and the one thing this has to say is that a piece
// of the FLOOR is different. So a patch is an irregular polygon: a closed loop
// of vertices whose radius wanders, with no two the same. It is generated as
// geometry rather than painted into a texture because the outline is the part
// that has to be exact, and a soft-edged decal has no outline at all.
//
// The average radius is exactly 1, so a caller's radius in metres is the mesh
// scale and the damage circle and the patch agree at the edges.
//
// TWO FAMILIES, and the difference is the whole point of them. A SMOOTH patch
// is the player's - ash, the ground they made dangerous for the enemy. A
// JAGGED one hurts THEM. That distinction is carried by the silhouette first,
// by colour second and by the pulse third, so it survives colourblindness, a
// busy screen and a player who has never read a tooltip.
const CREEP_POINTS = 64;

function makeCreepShape(jagged, seed) {
  const shape = new THREE.Shape();
  // A few low-frequency lobes give the overall blobby outline; the jagged
  // family adds a high-frequency term on top, which is what turns a puddle
  // into something that looks burnt into the floor.
  const a1 = seed * 1.7, a2 = seed * 3.1, a3 = seed * 5.3;
  const lobes = jagged ? 7 : 3;
  let sum = 0;
  const r = new Array(CREEP_POINTS);
  for (let i = 0; i < CREEP_POINTS; i++) {
    const t = (i / CREEP_POINTS) * Math.PI * 2;
    let v = 1
      + 0.20 * Math.sin(t * 2 + a1)
      + 0.13 * Math.sin(t * 3 + a2)
      + 0.08 * Math.sin(t * 5 + a3);
    if (jagged) {
      v += 0.17 * Math.sin(t * lobes + a2 * 2)
        + 0.10 * Math.sin(t * (lobes * 2 + 1) + a3);
    }
    r[i] = Math.max(0.35, v);
    sum += r[i];
  }
  // Normalise so the MEAN radius is 1. Without this a spiky variant would
  // cover noticeably more ground than a smooth one at the same scale, and the
  // patch would stop matching the radius the damage check uses.
  const k = CREEP_POINTS / sum;
  for (let i = 0; i < CREEP_POINTS; i++) {
    const t = (i / CREEP_POINTS) * Math.PI * 2;
    const rad = r[i] * k;
    const x = Math.cos(t) * rad;
    const y = Math.sin(t) * rad;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

// Four variants per family, built once and shared. Enough that two patches
// side by side are never the same outline, few enough that they cost nothing.
const CREEP_VARIANTS = 4;

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

    // CREEP. The persistent patch of wrong ground under a lingering zone - an
    // ash cloud, a pool of blight, a magma trail. A separate pool from the
    // telegraph marks for two reasons: marks are ten deep and transient, while
    // creep is held for the whole life of a zone and a magma walker alone can
    // hold a dozen, so sharing would starve the telegraphs. And creep is meant
    // to look like terrain rather than like an instruction.
    //
    // Each patch is an irregular polygon plus a slightly larger copy of the
    // SAME polygon behind it, which reads as a border that follows every kink
    // in the outline. The old version was a soft disc inside a hard ring, and
    // a ring is the one shape a player already reads as UI.
    //
    // Whose patch it is comes from the shape family (see makeCreepShape) and
    // is set when the slot is claimed, because that is the only moment the
    // geometry needs to change.
    this.creepGeo = { smooth: [], jagged: [] };
    for (let i = 0; i < CREEP_VARIANTS; i++) {
      this.creepGeo.smooth.push(makeCreepShape(false, i * 2.3 + 0.7));
      this.creepGeo.jagged.push(makeCreepShape(true, i * 3.7 + 1.9));
    }
    this.creep = [];
    for (let i = 0; i < 30; i++) {
      const grp = new THREE.Group();
      const fillMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const edgeMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const variant = (Math.random() * CREEP_VARIANTS) | 0;
      // The border is drawn first and slightly wider, so the fill sits on top
      // of it and only the overhang shows. One geometry, two scales - the
      // border cannot drift out of register with the shape it is bordering.
      const edge = new THREE.Mesh(this.creepGeo.smooth[variant], edgeMat);
      const fill = new THREE.Mesh(this.creepGeo.smooth[variant], fillMat);
      fill.scale.setScalar(0.86);
      // Fractionally above the border so the two do not z-fight where they
      // overlap; both are still under the telegraph marks at 0.06.
      fill.position.z = 0.004;
      grp.add(edge, fill);
      grp.rotation.x = -Math.PI / 2;
      grp.position.y = 0.035;
      grp.visible = false;
      grp.frustumCulled = false;
      scene.add(grp);
      this.creep.push({
        group: grp, fill, edge, fillMat, edgeMat, variant, hostile: false,
        spin: (Math.random() < 0.5 ? -1 : 1) * (0.10 + Math.random() * 0.12),
        phase: Math.random() * Math.PI * 2,
        used: false,
      });
    }
    this._creepT = 0;

    // LIGHTNING BOLTS. Same pooled-polyline shape as the arcs, at a size that
    // spans the whole arena vertically. Two strikes' worth: they live a fifth
    // of a second, and Lightning Wizard fires on 5% of hits.
    this.bolts = [];
    for (let i = 0; i < BOLT_FORKS * 2; i++) {
      const g = new THREE.BufferGeometry();
      g.setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array((BOLT_SEGMENTS + 1) * 3), 3)
      );
      const m = new THREE.LineBasicMaterial({ color: 0xfff17a, transparent: true, opacity: 0 });
      const line = new THREE.Line(g, m);
      line.visible = false;
      line.frustumCulled = false;
      scene.add(line);
      this.bolts.push({ line, life: 0 });
    }
    this._boltAt = new THREE.Vector3();

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

  /**
   * Claim a creep slot for a zone, held until the zone expires. Returns -1
   * when the pool is full, which a caller must survive - the zone still deals
   * its damage, it just goes undecorated.
   *
   * @param {boolean} hostile true when this patch hurts the PLAYER. It picks
   *   the jagged shape family instead of the smooth one, which is the primary
   *   way the two are told apart - see makeCreepShape.
   */
  creepAcquire(hostile = false) {
    for (let i = 0; i < this.creep.length; i++) {
      const c = this.creep[i];
      if (c.used) continue;
      c.used = true;
      c.hostile = hostile;
      const geo = (hostile ? this.creepGeo.jagged : this.creepGeo.smooth)[c.variant];
      c.edge.geometry = geo;
      c.fill.geometry = geo;
      // A fresh outline every time a slot is reused, so a magma trail is a
      // line of different-looking scorches rather than one shape stamped
      // twelve times.
      c.fill.rotation.z = Math.random() * Math.PI * 2;
      c.edge.rotation.z = c.fill.rotation.z;
      c.group.visible = true;
      return i;
    }
    return -1;
  }

  /**
   * Position and tint one zone's ground patch. Call every frame it is alive.
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
    c.edgeMat.color.setHex(color);
    const k = Math.max(0, Math.min(1, intensity));
    // A HOSTILE patch breathes and a friendly one does not. Movement is what
    // the eye is drawn to in a crowded frame, so it is spent on the only
    // patches the player has to get out of; ground they made dangerous for the
    // enemy sits still and stays out of the way.
    if (c.hostile) {
      const pulse = 0.78 + Math.sin(this._creepT * 4.2 + c.phase) * 0.22;
      c.fillMat.opacity = 0.5 * k;
      c.edgeMat.opacity = 1.0 * k * pulse;
    } else {
      c.fillMat.opacity = 0.34 * k;
      c.edgeMat.opacity = 0.42 * k;
    }
  }

  creepRelease(h) {
    if (h < 0) return;
    this.creep[h].used = false;
    this.creep[h].group.visible = false;
    this.creep[h].fillMat.opacity = 0;
    this.creep[h].edgeMat.opacity = 0;
  }

  /**
   * A bolt of lightning onto (x, z). Lightning Wizard's whole tell: the strike
   * has to be unmistakably a strike, and it has to say how far the splash
   * reached, because that is the part of the mutation a player cannot infer
   * from the damage numbers.
   *
   * The bolt is one polyline from well above the arena down to the floor,
   * jittered sideways at every joint. Straight would read as a laser.
   */
  lightning(x, z, radius) {
    // Every fork of one strike shares the point it lands on and nothing else,
    // so the three lines splay apart with height and meet at the floor.
    for (let f = 0; f < BOLT_FORKS; f++) {
      let slot = null;
      for (const b of this.bolts) {
        if (b.life <= 0) { slot = b; break; }
      }
      // Every bolt busy means two strikes landed within a fifth of a second,
      // which is exactly when overwriting the oldest is right - the newest
      // strike is the one the player is looking for.
      if (!slot) slot = this.bolts[f];
      const pos = slot.line.geometry.attributes.position;
      // Drifts as it descends, so the top of the bolt is not directly over the
      // point it hits. A perfectly vertical column reads as a spawn effect.
      const topX = x + (Math.random() - 0.5) * 4.5;
      const topZ = z + (Math.random() - 0.5) * 4.5;
      for (let i = 0; i <= BOLT_SEGMENTS; i++) {
        const t = i / BOLT_SEGMENTS;
        // The kink dies away to nothing at the ground so the bolt actually
        // touches the point it is meant to have struck.
        const wob = (1 - t) * 1.1 + 0.06;
        pos.setXYZ(
          i,
          topX + (x - topX) * t + (Math.random() - 0.5) * wob,
          BOLT_HEIGHT * (1 - t) + 0.05,
          topZ + (z - topZ) * t + (Math.random() - 0.5) * wob
        );
      }
      pos.needsUpdate = true;
      slot.line.visible = true;
      slot.life = BOLT_LIFE;
    }
    // The strike point gets a ring at exactly the splash radius and a column
    // of sparks: the ring is the only thing that says how far the extra damage
    // reached, which is the part of the mutation a player cannot infer from
    // watching one enemy die.
    this._boltAt.set(x, 0.05, z);
    this.shockwave(this._boltAt, 0xfff17a, radius, 0.45);
    this._boltAt.y = 0.5;
    this.burst(this._boltAt, 0xfff17a, 30, 7, 6, 0.55);
    this.burst(this._boltAt, 0x9fd8ff, 18, 4, 4, 0.45);
    this.flash(this._boltAt);
    this.addShake(0.16);
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
      if (!c.used) continue;
      c.fill.rotation.z += c.spin * dt;
      c.edge.rotation.z = c.fill.rotation.z;
    }
    // Bolts are held bright and then dropped, for the same reason the homing
    // arcs are: a GL line is one pixel wide whatever is asked for, so how long
    // it stays at full strength is the only lever on whether it is readable.
    for (const b of this.bolts) {
      if (b.life <= 0) continue;
      b.life -= dt;
      b.line.material.opacity = Math.max(0, Math.min(1, (b.life / BOLT_LIFE) * 2.6));
      if (b.life <= 0) b.line.visible = false;
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