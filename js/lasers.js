// The laser bank: three mirrored pairs of fan projectors hung on the truss,
// firing down and across the room, plus a pool of strays that answer to
// nothing.
//
// WHY THIS IS NOT MORE BEAMS. The beams in rig.js are soft textured cones that
// fade along their length - light you can see the air in. A laser is the
// opposite instrument: a hard-edged line of even width and colour that ends
// only where it hits something. Both in one room is what reads as a RIG rather
// than as one effect turned up.
//
// THE DIVISION OF LABOUR: the beams own the BEAT, and most of the lasers own
// the MOVEMENT. A fan comes on, stays on for its bars, and turns the whole
// time. A minority of them PULSE instead, so the beat is not something the
// lasers are entirely deaf to - but they are the minority on purpose, because
// four fans blinking on every kick next to four beams already stabbing is the
// same event twice.
//
// A FAN IS TWO THINGS AT ONCE: the RAYS, sharp and thin, and the SHEET between
// them, which is the haze they are cutting lit from the side. Rays alone are a
// diagram of a fan. The sheet is drawn as a wedge that is brightest at the
// lens and fades to nothing by the far end - see the note on WHERE A RAY STOPS
// for why that fade has to land exactly where it does.
//
// SYMMETRY IS THE POINT. Each pair's right projector is its left REFLECTED
// through x = 0 - not worked out separately - so the two are exact mirrors and
// stay so however the fan animates. Reflecting means negating x on the aim AND
// on both vectors spanning the fan's plane; do it to only some of them and the
// mirrored fan rolls the wrong way. Get the sign backwards, as this file did
// once, and half the rig fires into the wall behind it and is silently eaten.
//
// NOTHING STAYS ON. A pair plays for at most one phrase and then has to sit
// out; a stray lives a second or so. Light that is always there stops being an
// event, and the room only has moments if it also has gaps.
//
// Nothing here allocates after construction, and no light is created - a laser
// is geometry, so the rig's light-count contract is untouched.
import * as THREE from 'three';
import { BOUND, CEIL_Y } from './arena.js';

// Rays per projector. Odd, so the fan has a centre ray to be symmetric about,
// and few enough that each still reads as a line rather than merging into a
// wall - the gaps between them are where the soft fill shows.
const RAYS = 9;

// WHERE THEY HANG. On the truss, under the ceiling, firing down and across.
// Not on the walls at head height, which is where they used to be: from there
// the rays left from nowhere in the player's own plane and read as an effect
// drawn over the room rather than as fixtures in it.
const HEIGHT = 12.4;
// How steeply the aim drops. Shallow on purpose - at this pitch a ray from the
// truss runs about 36 metres before it reaches the floor, so it crosses the
// whole room on the way down instead of landing at the projector's feet.
const DROP = 0.42;
const RIG_POINTS = [
  { x: 16, z: -16, aimZ: 0.55 },
  { x: 16, z: 16, aimZ: -0.55 },
  { x: 19.5, z: 0, aimZ: 0 },
];

// WHERE A RAY STOPS. Not at a fixed length with the depth buffer cutting it -
// that was the old way and it is what put a hard edge across the floor. Every
// ray is intersected with the room box and ends exactly where it lands, which
// buys two things: the wedge's fade reaches zero AT the surface instead of
// being sliced open at whatever brightness it happened to be, and a ray that
// only travels twelve metres straight down fades over twelve metres rather
// than being cut off a fifth of the way through its gradient.
//
// The depth test still handles pillars and crates. This handles the box.
const MAX_LEN = 70;

// RAY WIDTH IS ANGULAR, NOT METRIC, and this is the difference between the
// bank being there and being invisible. A ribbon a fixed few centimetres wide
// is under a pixel across by the time it has crossed a forty-metre room, and
// sub-pixel geometry does not draw faint - without multisampling it aliases
// out completely.
//
// A real laser behaves like a constant screen width: the same apparent
// thickness however far away the part you are looking at is. So the ribbon is
// a TRAPEZOID, each end widened for its own distance from the camera.
//
// PX is one pixel's worth of world size per unit of distance at this
// projection, 2*tan(fov/2)/height. WIDTH_PX is well under one, which the
// renderer's multisampling turns into a thin line at partial coverage rather
// than a dashed one - only safe BECAUSE the canvas is antialiased.
const PX = 0.0016;
const WIDTH_PX = 0.55;
const MIN_W = 0.008;

// Half-angle of the fan at its widest, in radians.
const SPREAD_MAX = 0.52;
const SPREAD_MIN = 0.18;
// Radians a fan turns per second, and how fast its spread drifts. Slow: a
// sustaining fan is the thing in the room NOT punctuating anything.
const SWEEP_RATE = 0.4;
const EASE = 1.6;

// Brightness of a lit fan, the peak of a pulsing one, and the ceiling both are
// clamped to. A pulse peaks higher than a sustain holds, because it is dark
// most of the time and has to pay for the gap.
const SUSTAIN = 0.95;
const PULSE = 1.25;
const MAX_OP = 0.95;
// Chance a pair pulses rather than sustains, decided per phrase.
const PULSE_CHANCE = 0.3;
// The soft wedge, against the rays' own brightness. Low both because it is
// haze rather than another ray and because it covers a hundred times the
// pixels, which is where the fill rate would go.
const FILL = 0.16;
// The aperture never goes fully dark while its pair is up. A projector with a
// black lens is scenery; the glowing dot at the apex is what says the rays are
// coming OUT of something.
const APERTURE_FLOOR = 0.35;

// The longest a pair may be lit without a break, in bars. Four is one phrase.
// A fan that is simply always on is not an event any more, and the ones that
// arrive later in a phrase only read as arriving because something else left.
const MAX_BARS = 4;

// ---- strays ----------------------------------------------------------------
// Single rays from nowhere in particular, in bursts of one to five, lasting a
// second or so. The banks above are a rig: symmetric, on the bar, doing
// something legible. These are the opposite and that is their whole job - a
// room where everything is on the grid reads as a screensaver, and a few
// lights doing something unaccountable is what makes the rest look deliberate.
const STRAYS = 8;
const STRAY_CHANCE = 0.22;
const STRAY_LIFE = [0.35, 1.6];
const STRAY_GAIN = 0.8;
// Seconds of fade at the end of a stray's life. Short: a laser switches off.
const STRAY_OUT = 0.12;

function distance(x, y, z, p) {
  const dx = x - p.x, dy = y - p.y, dz = z - p.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// How far a ray from (ox,oy,oz) along (dx,dy,dz) travels before it leaves the
// room. Slab intersection against the six planes, nearest positive hit.
function exitT(ox, oy, oz, dx, dy, dz) {
  let t = MAX_LEN;
  if (dx > 1e-6) t = Math.min(t, (BOUND - ox) / dx);
  else if (dx < -1e-6) t = Math.min(t, (-BOUND - ox) / dx);
  if (dz > 1e-6) t = Math.min(t, (BOUND - oz) / dz);
  else if (dz < -1e-6) t = Math.min(t, (-BOUND - oz) / dz);
  if (dy > 1e-6) t = Math.min(t, (CEIL_Y - oy) / dy);
  else if (dy < -1e-6) t = Math.min(t, -oy / dy);
  // Never zero: a degenerate ribbon would still be submitted and would still
  // cost a triangle, and it can produce a NaN normal on the way.
  return Math.max(0.6, t);
}

function dynamic(array, itemSize) {
  const a = new THREE.BufferAttribute(array, itemSize);
  a.setUsage(THREE.DynamicDrawUsage);
  return a;
}

// One mirrored pair: two projectors, their housings, one rays mesh, one fill
// mesh, and the animation state they share.
class Bank {
  constructor(parent, point, boxGeo, apertureGeo, housingMat) {
    // The LEFT projector, at -x, aiming across to +x and downward. The right
    // is this reflected, which is the factor `m` below.
    const u = new THREE.Vector3(1, -DROP, point.aimZ).normalize();
    const p = new THREE.Vector3(0, 1, 0);
    p.addScaledVector(u, -u.dot(p)).normalize();
    const q = new THREE.Vector3().crossVectors(u, p).normalize();

    this.aperture = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    });

    this.emitters = [];
    for (const sx of [-1, 1]) {
      const m = -sx;
      const pos = new THREE.Vector3(point.x * sx, HEIGHT, point.z);
      const dir = new THREE.Vector3(u.x * m, u.y, u.z);
      this.emitters.push({
        pos, u: dir,
        p: new THREE.Vector3(p.x * m, p.y, p.z),
        q: new THREE.Vector3(q.x * m, q.y, q.z),
      });
      const body = new THREE.Mesh(boxGeo, housingMat);
      body.position.copy(pos).addScaledVector(dir, -0.28);
      body.scale.set(0.5, 0.5, 0.9);
      body.lookAt(pos.x + dir.x, pos.y + dir.y, pos.z + dir.z);
      parent.add(body);
      const lens = new THREE.Mesh(apertureGeo, this.aperture);
      lens.position.copy(pos);
      parent.add(lens);
    }

    this.roll = Math.random() * Math.PI * 2;
    this.spread = SPREAD_MAX;
    this.spreadTo = SPREAD_MAX;
    // Which way this pair turns. Opposed within the room, so two fans up at
    // once open away from each other instead of sliding along together.
    this.spin = 1;
    this.pulsing = false;
    this.entry = 0;
    this.playing = false;
    this.on = false;
    this.barsOn = 0;
    // 0 or 1, never in between: see the note on the instant gate in update().
    this.gain = 0;

    // ---- the rays: one camera-facing ribbon per ray -------------------------
    const quads = this.emitters.length * RAYS;
    this._rayPos = new Float32Array(quads * 4 * 3);
    const rayIdx = new Uint16Array(quads * 6);
    for (let i = 0; i < quads; i++) {
      const v = i * 4, k = i * 6;
      rayIdx[k] = v; rayIdx[k + 1] = v + 1; rayIdx[k + 2] = v + 2;
      rayIdx[k + 3] = v; rayIdx[k + 4] = v + 2; rayIdx[k + 5] = v + 3;
    }
    this.rayGeo = new THREE.BufferGeometry();
    this.rayGeo.setAttribute('position', dynamic(this._rayPos, 3));
    this.rayGeo.setIndex(new THREE.BufferAttribute(rayIdx, 1));
    // The rays reach further than a bounding sphere inferred from any one
    // frame, and a wrong one frustum-culls the pair at the worst moment.
    this.rayGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 70);

    this.rayMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending,
      // Depth TEST on, so a pillar cuts the ray. Depth WRITE off, or the rays
      // would occlude each other and the crossings - the best part - would go.
      depthWrite: false, side: THREE.DoubleSide, fog: false,
    });
    this.rayMesh = new THREE.Mesh(this.rayGeo, this.rayMat);
    this.rayMesh.frustumCulled = false;
    this.rayMesh.renderOrder = 4;
    parent.add(this.rayMesh);

    // ---- the fill: a wedge, brightest at the lens, gone by the far end ------
    // The gradient is a VERTEX COLOUR, not a texture: the apex vertex carries
    // alpha 1 and both far vertices alpha 0, and the rasteriser interpolates
    // between them for free. It is written once here and never touched again,
    // because it is expressed in the triangle's own terms - wherever the far
    // vertices end up, they are the end of the fade.
    const tris = this.emitters.length * (RAYS - 1);
    this._fillPos = new Float32Array(tris * 3 * 3);
    const fillCol = new Float32Array(tris * 3 * 4);
    for (let i = 0; i < tris; i++) {
      const k = i * 12;
      fillCol[k] = 1; fillCol[k + 1] = 1; fillCol[k + 2] = 1; fillCol[k + 3] = 1;
      fillCol[k + 4] = 1; fillCol[k + 5] = 1; fillCol[k + 6] = 1; fillCol[k + 7] = 0;
      fillCol[k + 8] = 1; fillCol[k + 9] = 1; fillCol[k + 10] = 1; fillCol[k + 11] = 0;
    }
    this.fillGeo = new THREE.BufferGeometry();
    this.fillGeo.setAttribute('position', dynamic(this._fillPos, 3));
    this.fillGeo.setAttribute('color', new THREE.BufferAttribute(fillCol, 4));
    this.fillGeo.boundingSphere = this.rayGeo.boundingSphere;
    this.fillMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0, vertexColors: true,
      blending: THREE.AdditiveBlending, depthWrite: false,
      side: THREE.DoubleSide, fog: false,
    });
    this.fillMesh = new THREE.Mesh(this.fillGeo, this.fillMat);
    this.fillMesh.frustumCulled = false;
    // Under the rays, so the sharp lines read on top of their own haze.
    this.fillMesh.renderOrder = 3;
    parent.add(this.fillMesh);

    // Far end of every ray of the emitter being written, reused between the
    // ray pass and the fill pass so the directions are computed once.
    this._far = new Float32Array(RAYS * 3);
  }
}

export class Lasers {
  constructor(parent, boxGeo) {
    const apertureGeo = new THREE.SphereGeometry(0.17, 8, 6);
    const housingMat = new THREE.MeshBasicMaterial({ color: 0x0b0e14 });
    this.banks = RIG_POINTS.map((pt) => new Bank(parent, pt, boxGeo, apertureGeo, housingMat));
    this.banks.forEach((b, i) => { b.spin = i & 1 ? -1 : 1; });

    // ---- the stray pool ----------------------------------------------------
    // One mesh for all of them. A stray that is not alive is written as a
    // degenerate quad at the origin with alpha zero, so the pool never changes
    // size and nothing is ever created or destroyed mid-run.
    this.strays = [];
    for (let i = 0; i < STRAYS; i++) {
      this.strays.push({
        alive: false, life: 0, max: 1,
        pos: new THREE.Vector3(), dir: new THREE.Vector3(),
        axis: new THREE.Vector3(0, 1, 0), rate: 0,
      });
    }
    this._strayPos = new Float32Array(STRAYS * 4 * 3);
    this._strayCol = new Float32Array(STRAYS * 4 * 4);
    const sIdx = new Uint16Array(STRAYS * 6);
    for (let i = 0; i < STRAYS; i++) {
      const v = i * 4, k = i * 6;
      sIdx[k] = v; sIdx[k + 1] = v + 1; sIdx[k + 2] = v + 2;
      sIdx[k + 3] = v; sIdx[k + 4] = v + 2; sIdx[k + 5] = v + 3;
    }
    this.strayGeo = new THREE.BufferGeometry();
    this.strayGeo.setAttribute('position', dynamic(this._strayPos, 3));
    // Alpha per VERTEX because it is per RAY: one material's opacity cannot
    // give eight strays eight different lifetimes.
    this.strayGeo.setAttribute('color', dynamic(this._strayCol, 4));
    this.strayGeo.setIndex(new THREE.BufferAttribute(sIdx, 1));
    this.strayGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 70);
    this.strayMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0, vertexColors: true,
      blending: THREE.AdditiveBlending, depthWrite: false,
      side: THREE.DoubleSide, fog: false,
    });
    this.strayMesh = new THREE.Mesh(this.strayGeo, this.strayMat);
    this.strayMesh.frustumCulled = false;
    this.strayMesh.renderOrder = 4;
    parent.add(this.strayMesh);

    // Scratch, so the per-frame maths allocates nothing.
    this._v = new THREE.Vector3();
    this._d = new THREE.Vector3();
    this._side = new THREE.Vector3();
    this._toCam = new THREE.Vector3();
  }

  // A new four-bar phrase. Recasts every pair: whether it plays, when it comes
  // in, and whether it sustains or pulses.
  phrase() {
    let playing = 0;
    for (let i = 0; i < this.banks.length; i++) {
      const b = this.banks[i];
      // A pair that ran the whole of the last phrase has to sit this one out.
      // Together with the cap in bar() this is what bounds any pair to four
      // bars of continuous light.
      const spent = b.barsOn >= MAX_BARS;
      b.barsOn = 0;
      b.playing = !spent && Math.random() < 0.66;
      if (b.playing) playing++;
      // Bar 0, 1 or 2 of the phrase. Never 3: a pair that arrives for the last
      // bar has not entered, it has flickered.
      b.entry = (Math.random() * 3) | 0;
      b.pulsing = Math.random() < PULSE_CHANCE;
      b.spreadTo = SPREAD_MIN + Math.random() * (SPREAD_MAX - SPREAD_MIN);
      if (Math.random() < 0.4) b.spin = -b.spin;
    }
    // Never leave the room with nothing, unless every pair is genuinely spent.
    if (!playing) {
      for (let i = 0; i < this.banks.length; i++) {
        const b = this.banks[i];
        if (b.barsOn < MAX_BARS) { b.playing = true; b.entry = 0; break; }
      }
    }
  }

  // A downbeat. `index` is 0..3 through the phrase; a pair is in once its own
  // entry bar has come round, and out again the moment it has had its four.
  bar(index) {
    for (let i = 0; i < this.banks.length; i++) {
      const b = this.banks[i];
      if (b.on) b.barsOn++;
      b.on = b.playing && index >= b.entry && b.barsOn < MAX_BARS;
    }
  }

  // A beat. The banks do not listen - the pulsing ones read the envelope in
  // update() rather than being cued - but the strays fire from here, so that
  // even the part of the rig that is off the grid arrives on it.
  beat() {
    if (Math.random() > STRAY_CHANCE) return;
    let want = 1 + ((Math.random() * 5) | 0);
    for (let i = 0; i < this.strays.length && want > 0; i++) {
      const s = this.strays[i];
      if (s.alive) continue;
      want--;
      s.alive = true;
      s.life = 0;
      s.max = STRAY_LIFE[0] + Math.random() * (STRAY_LIFE[1] - STRAY_LIFE[0]);
      // Somewhere along the truss, pointing anywhere it can still reach the
      // room from - mostly down, because that is where a ceiling fires.
      s.pos.set((Math.random() * 2 - 1) * 18, HEIGHT, (Math.random() * 2 - 1) * 18);
      const az = Math.random() * Math.PI * 2;
      const el = -0.9 + Math.random() * 1.0;
      const c = Math.cos(el);
      s.dir.set(Math.cos(az) * c, Math.sin(el), Math.sin(az) * c).normalize();
      s.axis.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize();
      s.rate = (0.15 + Math.random() * 0.5) * (Math.random() < 0.5 ? -1 : 1);
    }
  }

  // `punch` is the beat envelope the beams stab on, read only by the pairs
  // that pulse. `master` is what the ROOM allows: the look's multiplier, the
  // energy, the house lights and the blackout cue.
  update(dt, camPos, colour, punch, master) {
    const ease = Math.min(1, dt * EASE);
    for (let i = 0; i < this.banks.length; i++) {
      const b = this.banks[i];
      // INSTANT, not eased. A lamp with a shutter is on or it is off, and the
      // couple of frames of ramp that used to be here read as a dissolve -
      // which is the one thing a laser never does.
      b.gain = b.on ? 1 : 0;

      const lit = Math.min(MAX_OP,
        (b.pulsing ? PULSE * punch : SUSTAIN) * b.gain * master);
      b.rayMat.opacity = lit;
      b.fillMat.opacity = lit * FILL;
      // The lens stays bright while its pair is up even as a pulse falls away,
      // so the projector reads as a thing that is switched on.
      b.aperture.opacity = Math.min(1, lit + APERTURE_FLOOR * b.gain * Math.min(1, master * 2));
      // A fully transparent mesh still rasterises every one of its pixels, and
      // these are long. Not drawing them at all is most of the budget.
      const show = lit > 0.006;
      b.rayMesh.visible = show;
      b.fillMesh.visible = show;
      if (!show) continue;
      b.rayMat.color.copy(colour);
      b.fillMat.color.copy(colour);
      b.aperture.color.copy(colour);

      b.roll += SWEEP_RATE * dt * b.spin;
      b.spread += (b.spreadTo - b.spread) * ease;
      this._write(b, camPos);
    }
    this._writeStrays(dt, camPos, colour, master);
  }

  _write(b, camPos) {
    const ray = b._rayPos, fill = b._fillPos, far = b._far;
    const cr = Math.cos(b.roll), sr = Math.sin(b.roll);
    let o = 0, f = 0;
    for (let e = 0; e < b.emitters.length; e++) {
      const em = b.emitters[e];
      // The fan's plane: the aim, and one vector rolled around it.
      this._v.copy(em.p).multiplyScalar(cr).addScaledVector(em.q, sr);
      this._toCam.copy(camPos).sub(em.pos);
      const ax = em.pos.x, ay = em.pos.y, az = em.pos.z;
      const wa = Math.max(MIN_W, distance(ax, ay, az, camPos) * PX * WIDTH_PX);

      for (let r = 0; r < RAYS; r++) {
        const a = ((r / (RAYS - 1)) * 2 - 1) * b.spread;
        const ca = Math.cos(a), sa = Math.sin(a);
        this._d.copy(em.u).multiplyScalar(ca).addScaledVector(this._v, sa);
        o = this._ribbon(ray, o, ax, ay, az, this._d, wa, camPos, far, r);
      }

      // The wedge: one triangle from the lens out to each adjacent pair of far
      // points. The gradient rides on the vertex colours set in the
      // constructor, so it always fades to nothing exactly where the rays end.
      for (let r = 0; r < RAYS - 1; r++) {
        fill[f] = ax; fill[f + 1] = ay; fill[f + 2] = az;
        fill[f + 3] = far[r * 3]; fill[f + 4] = far[r * 3 + 1]; fill[f + 5] = far[r * 3 + 2];
        fill[f + 6] = far[r * 3 + 3]; fill[f + 7] = far[r * 3 + 4]; fill[f + 8] = far[r * 3 + 5];
        f += 9;
      }
    }
    b.rayGeo.attributes.position.needsUpdate = true;
    b.fillGeo.attributes.position.needsUpdate = true;
  }

  // Writes one camera-facing ribbon and returns the new write offset. `far`,
  // when given, receives the ray's landing point for the fill to reuse.
  _ribbon(buf, o, ax, ay, az, d, wa, camPos, far, slot) {
    const t = exitT(ax, ay, az, d.x, d.y, d.z);
    const bx = ax + d.x * t, by = ay + d.y * t, bz = az + d.z * t;
    if (far) { far[slot * 3] = bx; far[slot * 3 + 1] = by; far[slot * 3 + 2] = bz; }
    // Billboard: the ribbon's width runs across both the ray and the line of
    // sight, so it keeps its thickness however it is viewed. Edge-on the cross
    // collapses, which is correct - a laser aimed at your eye is a dot.
    this._side.crossVectors(d, this._toCam);
    const len = this._side.length();
    if (len > 1e-5) this._side.multiplyScalar(1 / len);
    else this._side.set(0, 0, 0);
    const wb = Math.max(MIN_W, distance(bx, by, bz, camPos) * PX * WIDTH_PX);
    const sx = this._side.x, sy = this._side.y, sz = this._side.z;
    buf[o] = ax + sx * wa; buf[o + 1] = ay + sy * wa; buf[o + 2] = az + sz * wa;
    buf[o + 3] = ax - sx * wa; buf[o + 4] = ay - sy * wa; buf[o + 5] = az - sz * wa;
    buf[o + 6] = bx - sx * wb; buf[o + 7] = by - sy * wb; buf[o + 8] = bz - sz * wb;
    buf[o + 9] = bx + sx * wb; buf[o + 10] = by + sy * wb; buf[o + 11] = bz + sz * wb;
    return o + 12;
  }

  _writeStrays(dt, camPos, colour, master) {
    const pos = this._strayPos, col = this._strayCol;
    let any = false;
    for (let i = 0; i < this.strays.length; i++) {
      const s = this.strays[i];
      const c = i * 16;
      if (!s.alive) {
        if (col[c + 3] !== 0) {
          for (let v = 0; v < 4; v++) col[c + v * 4 + 3] = 0;
        }
        continue;
      }
      s.life += dt;
      if (s.life >= s.max) {
        s.alive = false;
        for (let v = 0; v < 4; v++) col[c + v * 4 + 3] = 0;
        continue;
      }
      any = true;
      // Full brightness the whole way, then out. A stray does not dim in, it
      // appears; the only ramp is the short one at the end, and even that is
      // there to stop a single-frame disappearance reading as a dropped frame.
      const left = s.max - s.life;
      const a = left < STRAY_OUT ? left / STRAY_OUT : 1;
      s.dir.applyAxisAngle(s.axis, s.rate * dt).normalize();
      this._toCam.copy(camPos).sub(s.pos);
      const wa = Math.max(MIN_W, distance(s.pos.x, s.pos.y, s.pos.z, camPos) * PX * WIDTH_PX);
      this._ribbon(pos, i * 12, s.pos.x, s.pos.y, s.pos.z, s.dir, wa, camPos, null, 0);
      for (let v = 0; v < 4; v++) {
        col[c + v * 4] = 1; col[c + v * 4 + 1] = 1; col[c + v * 4 + 2] = 1;
        col[c + v * 4 + 3] = a;
      }
    }
    this.strayMat.opacity = Math.min(MAX_OP, STRAY_GAIN * master);
    this.strayMesh.visible = any && this.strayMat.opacity > 0.006;
    if (!this.strayMesh.visible) return;
    this.strayMat.color.copy(colour);
    this.strayGeo.attributes.position.needsUpdate = true;
    this.strayGeo.attributes.color.needsUpdate = true;
  }
}
