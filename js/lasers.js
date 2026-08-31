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
// Kept just under the clamp at full drive rather than over it: a value that
// saturates spends the top of the room's energy range flat, and the last bit
// of a big combo stops showing up in the light.
const SUSTAIN = 1.05;
const PULSE = 1.4;
const MAX_OP = 1.0;
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

// How many single rays the stray pool holds. Declared up here because the
// impact pool below is sized to cover every ray in the room at once.
const STRAYS = 8;

// ---- impacts ---------------------------------------------------------------
// The spot where a ray lands. A laser in a real room is two things you see: the
// line through the haze, and the burning dot on whatever it is pointed at - and
// the dot is the brighter of the two, because it is all of the beam's energy
// arriving at one place instead of the fraction of it that scatters off smoke
// on the way. Without it the rays look like they are drawn over the room rather
// than shone into it.
//
// A small hard core at the point itself, and a wider soft halo around it that
// falls to nothing. Both are one billboarded fan per impact: a centre vertex,
// an inner ring at the core's edge, and an outer ring at the halo's, with the
// falloff carried in the vertex alpha exactly as the wedge's is. No texture -
// the budget is full at twelve - and a hexagon is round enough at this size.
//
// ONE MESH FOR EVERY IMPACT IN THE ROOM, banks and strays together, because
// each impact's brightness is written into its own vertices rather than taken
// from the material. That is also what lets a pulsing pair's spots pulse while
// a sustaining pair's hold, on the same draw call.
const IMPACT_SEGS = 6;
const IMPACT_SLOTS = 3 * 2 * RAYS + STRAYS;
const CORE_R = 0.09;
const GLOW_R = 0.5;
// The halo against the core. Under one, so the core reads as a separate,
// harder thing sitting inside it rather than as the peak of one smooth blob.
const HALO = 0.55;
// A beam meeting a surface square on makes a round spot; one arriving at a
// shallow angle makes a long one, because the same round cross-section is
// being spread over more surface - by exactly 1/cos of the incidence angle.
// That ratio runs away to infinity as a ray goes parallel to the floor, and a
// twenty-metre smear is not a light pool, so it is capped.
const STRETCH_MAX = 3.0;
// How bright a spot is against the ray that made it. Over one: see above.
const IMPACT_GAIN = 1.35;
// Pushed this far off the surface, ALONG ITS NORMAL. The point is exactly on
// the wall, and geometry coplanar with a wall z-fights with it.
const IMPACT_LIFT = 0.05;

// ---- strays ----------------------------------------------------------------
// Single rays from nowhere in particular, in bursts of one to five, lasting a
// second or so. The banks above are a rig: symmetric, on the bar, doing
// something legible. These are the opposite and that is their whole job - a
// room where everything is on the grid reads as a screensaver, and a few
// lights doing something unaccountable is what makes the rest look deliberate.
const STRAY_CHANCE = 0.22;
const STRAY_LIFE = [0.35, 1.6];
const STRAY_GAIN = 0.95;
// Seconds of fade at the end of a stray's life. Short: a laser switches off.
const STRAY_OUT = 0.12;

function distance(x, y, z, p) {
  const dx = x - p.x, dy = y - p.y, dz = z - p.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
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

    // ---- the impact pool ---------------------------------------------------
    // Every ray in the room lands somewhere, so the pool is sized for all of
    // them at once and slots are handed out in whatever order the frame writes
    // them. Unused slots are collapsed to alpha zero rather than removed.
    const verts = 1 + IMPACT_SEGS * 2;
    this._impactPos = new Float32Array(IMPACT_SLOTS * verts * 3);
    this._impactCol = new Float32Array(IMPACT_SLOTS * verts * 4);
    const tris = IMPACT_SEGS * 3;
    const iIdx = new Uint16Array(IMPACT_SLOTS * tris * 3);
    for (let i = 0; i < IMPACT_SLOTS; i++) {
      const v = i * verts;
      let k = i * tris * 3;
      for (let seg = 0; seg < IMPACT_SEGS; seg++) {
        const a = 1 + seg, b = 1 + ((seg + 1) % IMPACT_SEGS);
        const c = 1 + IMPACT_SEGS + seg, d = 1 + IMPACT_SEGS + ((seg + 1) % IMPACT_SEGS);
        // The core, as a fan from the centre out to the inner ring.
        iIdx[k++] = v; iIdx[k++] = v + a; iIdx[k++] = v + b;
        // The halo, as a band from the inner ring out to the outer one.
        iIdx[k++] = v + a; iIdx[k++] = v + c; iIdx[k++] = v + d;
        iIdx[k++] = v + a; iIdx[k++] = v + d; iIdx[k++] = v + b;
      }
    }
    this.impactGeo = new THREE.BufferGeometry();
    this.impactGeo.setAttribute('position', dynamic(this._impactPos, 3));
    this.impactGeo.setAttribute('color', dynamic(this._impactCol, 4));
    this.impactGeo.setIndex(new THREE.BufferAttribute(iIdx, 1));
    this.impactGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 70);
    this.impactMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 1, vertexColors: true,
      blending: THREE.AdditiveBlending, depthWrite: false,
      side: THREE.DoubleSide, fog: false,
    });
    this.impactMesh = new THREE.Mesh(this.impactGeo, this.impactMat);
    this.impactMesh.frustumCulled = false;
    // Over the rays: the spot is the brightest thing either of them makes.
    this.impactMesh.renderOrder = 5;
    parent.add(this.impactMesh);
    this._impactCount = 0;

    // Scratch, so the per-frame maths allocates nothing.
    this._v = new THREE.Vector3();
    this._d = new THREE.Vector3();
    this._side = new THREE.Vector3();
    this._toCam = new THREE.Vector3();
    this._n = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._up = new THREE.Vector3();
    // Surface normal of the last hit found by _exit(), pointing back into the
    // room. Kept as fields rather than returned, so the hot path allocates
    // nothing to carry two values out of one function.
    this._hitNx = 0; this._hitNy = 1; this._hitNz = 0;
  }

  // How far a ray from (ox,oy,oz) along (dx,dy,dz) travels before it leaves
  // the room, and which of the six planes it leaves through. Slab
  // intersection, nearest positive hit.
  //
  // The plane is the whole reason this is not just a distance: knowing WHICH
  // surface was struck gives the impact decal its orientation for free. The
  // normal is the opposite of the ray's own direction on the winning axis,
  // because a ray heading at +x leaves through the +x wall, whose inward face
  // points back at -x.
  _exit(ox, oy, oz, dx, dy, dz) {
    let t = MAX_LEN, axis = 1, sign = 1;
    if (dx > 1e-6) {
      const h = (BOUND - ox) / dx;
      if (h < t) { t = h; axis = 0; sign = -1; }
    } else if (dx < -1e-6) {
      const h = (-BOUND - ox) / dx;
      if (h < t) { t = h; axis = 0; sign = 1; }
    }
    if (dz > 1e-6) {
      const h = (BOUND - oz) / dz;
      if (h < t) { t = h; axis = 2; sign = -1; }
    } else if (dz < -1e-6) {
      const h = (-BOUND - oz) / dz;
      if (h < t) { t = h; axis = 2; sign = 1; }
    }
    if (dy > 1e-6) {
      const h = (CEIL_Y - oy) / dy;
      if (h < t) { t = h; axis = 1; sign = -1; }
    } else if (dy < -1e-6) {
      const h = -oy / dy;
      if (h < t) { t = h; axis = 1; sign = 1; }
    }
    this._hitNx = axis === 0 ? sign : 0;
    this._hitNy = axis === 1 ? sign : 0;
    this._hitNz = axis === 2 ? sign : 0;
    // Never zero: a degenerate ribbon would still be submitted and would still
    // cost a triangle, and it can produce a NaN basis on the way.
    return Math.max(0.6, t);
  }

  // Writes one landing spot into the impact pool: a hard core and a soft halo,
  // both carried in the vertex alpha.
  //
  // IT IS A DECAL, NOT A BILLBOARD, and that is the whole point of it. A disc
  // turned to face the camera stands UP out of the floor when you look along
  // the floor, and the floor's own depth then slices it off in a dead straight
  // line - a hard cut across what is supposed to be a soft pool. Lying it in
  // the surface instead leaves nothing to cut: the geometry is parallel to
  // what it sits on and a few centimetres in front of it.
  //
  // Seen at a grazing angle it foreshortens into a thin ellipse, which is not
  // a defect - it is what a pool of light on a floor does, and it is the thing
  // that makes it read as being ON the floor.
  //
  // The spot is STRETCHED along the ray's own direction in the plane. A beam
  // meeting a surface square on makes a circle; one arriving shallow spreads
  // the same cross-section over 1/cos of the surface, which is a streak. Only
  // one axis of the ellipse grows - across the beam nothing has changed.
  _impact(x, y, z, alpha, camPos, dx, dy, dz) {
    if (this._impactCount >= IMPACT_SLOTS || alpha <= 0.004) return;
    const slot = this._impactCount++;
    const verts = 1 + IMPACT_SEGS * 2;
    const pos = this._impactPos, col = this._impactCol;
    let o = slot * verts * 3, c = slot * verts * 4;

    this._n.set(this._hitNx, this._hitNy, this._hitNz);
    // The long axis: the ray's direction flattened into the surface. It
    // vanishes for a ray arriving dead square, which is exactly the case where
    // the spot is a circle and the direction does not matter - so any
    // perpendicular will do there.
    const along = dx * this._n.x + dy * this._n.y + dz * this._n.z;
    this._right.set(dx - this._n.x * along, dy - this._n.y * along, dz - this._n.z * along);
    if (this._right.lengthSq() < 1e-8) {
      this._right.set(this._n.y, this._n.z, this._n.x);
      this._right.addScaledVector(this._n, -this._right.dot(this._n));
    }
    this._right.normalize();
    this._up.crossVectors(this._n, this._right);
    // 1/cos of the incidence angle, capped. `along` is that cosine already,
    // the ray and the normal both being unit length.
    const stretch = Math.min(STRETCH_MAX, 1 / Math.max(Math.abs(along), 1e-3));

    const cx = x + this._n.x * IMPACT_LIFT;
    const cy = y + this._n.y * IMPACT_LIFT;
    const cz = z + this._n.z * IMPACT_LIFT;
    pos[o] = cx; pos[o + 1] = cy; pos[o + 2] = cz; o += 3;
    col[c] = 1; col[c + 1] = 1; col[c + 2] = 1; col[c + 3] = alpha; c += 4;
    for (let ring = 0; ring < 2; ring++) {
      const r = ring ? GLOW_R : CORE_R;
      const a = ring ? 0 : alpha * HALO;
      for (let seg = 0; seg < IMPACT_SEGS; seg++) {
        const t = (seg / IMPACT_SEGS) * Math.PI * 2;
        const ux = Math.cos(t) * r * stretch, uy = Math.sin(t) * r;
        pos[o] = cx + this._right.x * ux + this._up.x * uy;
        pos[o + 1] = cy + this._right.y * ux + this._up.y * uy;
        pos[o + 2] = cz + this._right.z * ux + this._up.z * uy;
        o += 3;
        col[c] = 1; col[c + 1] = 1; col[c + 2] = 1; col[c + 3] = a; c += 4;
      }
    }
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
    // Impact slots are handed out in whatever order this frame writes rays, so
    // the count restarts here and whatever is left over is cleared at the end.
    const usedLast = this._impactCount;
    this._impactCount = 0;
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
      this._write(b, camPos, lit * IMPACT_GAIN);
    }
    this._writeStrays(dt, camPos, colour, master);

    // Everything the pool held last frame and does not this one goes to alpha
    // zero. Only the difference is touched: rewriting all sixty-two slots on
    // every frame to clear a handful of them is work for nothing.
    const verts = 1 + IMPACT_SEGS * 2;
    for (let i = this._impactCount; i < usedLast; i++) {
      const c = i * verts * 4;
      for (let v = 0; v < verts; v++) this._impactCol[c + v * 4 + 3] = 0;
    }
    this.impactMesh.visible = this._impactCount > 0 || usedLast > 0;
    if (this.impactMesh.visible) {
      this.impactMat.color.copy(colour);
      this.impactGeo.attributes.position.needsUpdate = true;
      this.impactGeo.attributes.color.needsUpdate = true;
    }
  }

  _write(b, camPos, spot) {
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
        o = this._ribbon(ray, o, ax, ay, az, this._d, wa, camPos, far, r, spot);
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
  _ribbon(buf, o, ax, ay, az, d, wa, camPos, far, slot, spot) {
    // _exit also records which of the six planes was struck; the decal below
    // reads its normal straight out of that.
    const t = this._exit(ax, ay, az, d.x, d.y, d.z);
    const bx = ax + d.x * t, by = ay + d.y * t, bz = az + d.z * t;
    if (far) { far[slot * 3] = bx; far[slot * 3 + 1] = by; far[slot * 3 + 2] = bz; }
    // Where it lands. The one place the ray's whole energy arrives at once.
    this._impact(bx, by, bz, spot, camPos, d.x, d.y, d.z);
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
    const strayLit = Math.min(MAX_OP, STRAY_GAIN * master);
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
      this._ribbon(pos, i * 12, s.pos.x, s.pos.y, s.pos.z, s.dir, wa, camPos, null, 0,
        a * strayLit * IMPACT_GAIN);
      for (let v = 0; v < 4; v++) {
        col[c + v * 4] = 1; col[c + v * 4 + 1] = 1; col[c + v * 4 + 2] = 1;
        col[c + v * 4 + 3] = a;
      }
    }
    this.strayMat.opacity = strayLit;
    this.strayMesh.visible = any && strayLit > 0.006;
    if (!this.strayMesh.visible) return;
    this.strayMat.color.copy(colour);
    this.strayGeo.attributes.position.needsUpdate = true;
    this.strayGeo.attributes.color.needsUpdate = true;
  }
}
