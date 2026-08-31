// The laser bank: four fan projectors at head height, raking across the room.
//
// WHY THIS IS NOT MORE BEAMS. The beams in rig.js are soft textured cones that
// fade along their length - light you can see the air in. A laser is the
// opposite instrument: a hard-edged line of uniform width and colour that ends
// only when it hits something. Putting both in the room is what makes it read
// as a RIG rather than as one effect turned up, and it is why this is a
// separate file rather than four more entries in the beam loop.
//
// THE SHAPE IS A FAN, not a scattering of rays. Every projector fires its rays
// coplanar, spread evenly around one aim: that sheet is the signature of the
// thing, and rays that merely point in similar directions do not read as it.
// The plane the fan lies in ROTATES about the aim - that roll is the movement,
// and it is what a real fan projector does.
//
// SYMMETRY IS THE POINT. The four projectors are two mirrored pairs, and each
// pair is built by negating the X of one side's vectors rather than by
// computing the other side independently, so the two are exact mirrors and
// stay that way through any animation. A rig is symmetric; scattered light is
// not, and the eye knows the difference immediately.
//
// ONE MESH, ONE DRAW CALL. All forty-four rays live in a single BufferGeometry
// whose vertices are rewritten every frame from a preallocated array. Four
// dozen separate meshes would be four dozen draw calls of additive transparent
// geometry, which is the one thing this renderer is genuinely bad at. Nothing
// here allocates after construction, and no light is created - the rig's
// light-count contract is untouched, because a laser is geometry, not a light.
//
// THE COST IS FILL RATE, not draw calls or vertices. Long additive rays across
// the screen are overdraw, so the rays are thin, and they are gated by the
// same beat shutter the beams use - dark between hits is most of the budget.
import * as THREE from 'three';

// Rays per projector. Odd, so the fan has a centre ray to be symmetric about.
const RAYS = 11;
const EMITTERS = 4;
// Long enough to cross the room from any corner to any wall. The rays are
// depth-tested, so the walls cut them - which is what makes them look like
// they land somewhere rather than stopping in mid-air.
const LENGTH = 70;
// RAY WIDTH IS ANGULAR, NOT METRIC, and this is the difference between the
// bank being there and the bank being invisible. A ribbon a fixed few
// centimetres wide is under a pixel across by the time it has crossed a room
// forty metres wide, and sub-pixel geometry does not draw faint - it aliases
// out completely, so the far half of every ray simply is not there.
//
// A real laser behaves the same way a fixed screen width does: it is a line of
// roughly constant apparent thickness however far away the part you are
// looking at is. So the ribbon is a TRAPEZOID - each end is widened in
// proportion to its own distance from the camera - and it holds the same few
// pixels from end to end.
//
// The constant is one pixel's worth of world size per unit of distance at this
// projection: 2*tan(fov/2)/height. MIN_W keeps a ray that is right beside you
// from collapsing to nothing.
const PX = 0.0016;
const WIDTH_PX = 1.6;
const MIN_W = 0.02;
// Where the projectors stand: near the corners, at about head height, so the
// rays rake ACROSS the room at the level the fight is played at rather than
// raining down from the truss.
const INSET = 20.5;
const HEIGHT = 2.4;
// A slight upward tilt on the aim. Dead level and the rays vanish into the far
// wall at one point; tilted, they climb across it.
const RISE = 0.1;

// Half-angle of the fan at its widest, in radians.
const SPREAD_MAX = 0.5;
const SPREAD_MIN = 0.16;
// How fast roll and spread ease towards what the last beat asked for. Matched
// to the beams' own snap so the two instruments move on the same footing.
const EASE = 26;
// Radians the fan rolls per second in the sweeping look, where it turns
// continuously instead of snapping. Slow: this is the look that exists to be
// the opposite of the others.
const SWEEP_RATE = 0.55;

function distance(x, y, z, p) {
  const dx = x - p.x, dy = y - p.y, dz = z - p.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export class Lasers {
  constructor(parent) {
    // Two mirrored pairs, one per end of the room. Only the LEFT projector of
    // a pair is worked out; the right is that one reflected through x = 0,
    // which is what guarantees the two are exact mirrors and stay so however
    // the fan animates. Reflecting means negating x on all three of the aim
    // and the two vectors spanning the fan's plane - do it to only some of
    // them and the mirrored fan rolls the wrong way.
    //
    // The left projector aims across to +X, so the reflection factor is +1 on
    // the left and -1 on the right. Getting that backwards points half the rig
    // at the wall behind it, where the room quietly swallows it.
    this.emitters = [];
    for (const z of [-INSET, INSET]) {
      const u = new THREE.Vector3(1, RISE, z < 0 ? 1 : -1).normalize();
      // An orthonormal pair spanning the plane the fan can roll through.
      const p = new THREE.Vector3(0, 1, 0);
      p.addScaledVector(u, -u.dot(p)).normalize();
      const q = new THREE.Vector3().crossVectors(u, p).normalize();
      for (const sx of [-1, 1]) {
        const m = -sx;
        this.emitters.push({
          pos: new THREE.Vector3(INSET * sx, HEIGHT, z),
          u: new THREE.Vector3(u.x * m, u.y, u.z),
          p: new THREE.Vector3(p.x * m, p.y, p.z),
          q: new THREE.Vector3(q.x * m, q.y, q.z),
        });
      }
    }

    // Per PAIR, not per emitter: the two sides share their roll and spread so
    // that mirroring them produces one symmetric figure.
    this.pairs = [
      { roll: 0, rollTo: 0, spread: SPREAD_MAX, spreadTo: SPREAD_MAX },
      { roll: Math.PI * 0.5, rollTo: Math.PI * 0.5, spread: SPREAD_MAX, spreadTo: SPREAD_MAX },
    ];

    const quads = EMITTERS * RAYS;
    this._pos = new Float32Array(quads * 4 * 3);
    const index = new Uint16Array(quads * 6);
    for (let i = 0; i < quads; i++) {
      const v = i * 4;
      const k = i * 6;
      index[k] = v; index[k + 1] = v + 1; index[k + 2] = v + 2;
      index[k + 3] = v; index[k + 4] = v + 2; index[k + 5] = v + 3;
    }
    this.geo = new THREE.BufferGeometry();
    const attr = new THREE.BufferAttribute(this._pos, 3);
    attr.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', attr);
    this.geo.setIndex(new THREE.BufferAttribute(index, 1));
    // The rays reach further than any bounding sphere three.js could infer
    // from a frame where they happen to be short, and a wrong one frustum-culls
    // the whole bank at the worst moments. The room is 44 across; this covers
    // it whatever the fan is doing.
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 60);

    this.mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      // Depth TEST stays on, so a wall or a pillar cuts the ray and it looks
      // like it landed. Depth WRITE stays off, or the rays would occlude each
      // other and the crossings - the best part - would go away.
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    parent.add(this.mesh);

    // Scratch, so the per-frame maths allocates nothing.
    this._v = new THREE.Vector3();
    this._d = new THREE.Vector3();
    this._side = new THREE.Vector3();
    this._toCam = new THREE.Vector3();
  }

  // Called once per beat. `sweeping` leaves the roll alone, because the look
  // that turns continuously is the one that must not be interrupted by cues.
  cue(sweeping) {
    for (let i = 0; i < this.pairs.length; i++) {
      const pr = this.pairs[i];
      if (!sweeping) {
        // A big turn, either way. Small turns read as a fan that failed to
        // move rather than as one that moved a little.
        pr.rollTo += (0.3 + Math.random() * 0.5) * Math.PI * (Math.random() < 0.5 ? -1 : 1);
      }
      pr.spreadTo = SPREAD_MIN + Math.random() * (SPREAD_MAX - SPREAD_MIN);
    }
  }

  // `gain` is the bank's brightness for this frame, already gated by the beat.
  // At zero the mesh is not drawn at all - a fully transparent mesh still
  // rasterises every one of its pixels, and these are long.
  update(dt, camPos, colour, gain, sweeping) {
    this.mat.opacity = Math.min(0.85, gain);
    this.mesh.visible = this.mat.opacity > 0.006;
    if (!this.mesh.visible) return;
    this.mat.color.copy(colour);

    const ease = Math.min(1, dt * EASE);
    for (let i = 0; i < this.pairs.length; i++) {
      const pr = this.pairs[i];
      if (sweeping) pr.rollTo += SWEEP_RATE * dt * (i ? -1 : 1);
      pr.roll += (pr.rollTo - pr.roll) * ease;
      pr.spread += (pr.spreadTo - pr.spread) * ease;
    }

    const pos = this._pos;
    let o = 0;
    for (let e = 0; e < this.emitters.length; e++) {
      const em = this.emitters[e];
      // Pair 0 is the first two emitters, pair 1 the last two.
      const pr = this.pairs[e >> 1];
      // The fan's plane: the aim, and one vector rolled around it.
      const cr = Math.cos(pr.roll), sr = Math.sin(pr.roll);
      this._v.copy(em.p).multiplyScalar(cr).addScaledVector(em.q, sr);
      this._toCam.copy(camPos).sub(em.pos);

      for (let r = 0; r < RAYS; r++) {
        const a = ((r / (RAYS - 1)) * 2 - 1) * pr.spread;
        const ca = Math.cos(a), sa = Math.sin(a);
        this._d.copy(em.u).multiplyScalar(ca).addScaledVector(this._v, sa);
        // Billboard: the ribbon's width runs across both the ray and the line
        // of sight, so a ray keeps its thickness however it is viewed. Edge-on
        // the cross collapses, which is correct - a laser aimed at your eye is
        // a dot.
        this._side.crossVectors(this._d, this._toCam);
        const len = this._side.length();
        if (len > 1e-5) this._side.multiplyScalar(1 / len);
        else this._side.set(0, 0, 0);

        const ax = em.pos.x, ay = em.pos.y, az = em.pos.z;
        const bx = ax + this._d.x * LENGTH;
        const by = ay + this._d.y * LENGTH;
        const bz = az + this._d.z * LENGTH;
        // Each end widened for its own distance, so the ray keeps one apparent
        // thickness along its whole length.
        const wa = Math.max(MIN_W, distance(ax, ay, az, camPos) * PX * WIDTH_PX);
        const wb = Math.max(MIN_W, distance(bx, by, bz, camPos) * PX * WIDTH_PX);
        const sxv = this._side.x, syv = this._side.y, szv = this._side.z;
        pos[o] = ax + sxv * wa; pos[o + 1] = ay + syv * wa; pos[o + 2] = az + szv * wa;
        pos[o + 3] = ax - sxv * wa; pos[o + 4] = ay - syv * wa; pos[o + 5] = az - szv * wa;
        pos[o + 6] = bx - sxv * wb; pos[o + 7] = by - syv * wb; pos[o + 8] = bz - szv * wb;
        pos[o + 9] = bx + sxv * wb; pos[o + 10] = by + syv * wb; pos[o + 11] = bz + szv * wb;
        o += 12;
      }
    }
    this.geo.attributes.position.needsUpdate = true;
  }
}
