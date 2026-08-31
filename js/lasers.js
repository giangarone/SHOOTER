// The laser bank: three mirrored pairs of fan projectors at head height,
// raking across the room.
//
// WHY THIS IS NOT MORE BEAMS. The beams in rig.js are soft textured cones that
// fade along their length - light you can see the air in. A laser is the
// opposite instrument: a hard-edged line of even width and colour that ends
// only where it hits something. Both in one room is what reads as a RIG rather
// than as one effect turned up.
//
// THE SHAPE IS A FAN, not a scattering. Every projector fires its rays
// coplanar and evenly spread about one aim; that sheet is the signature, and
// rays that merely point in similar directions do not read as it. The plane
// rolls about the aim, and that roll is the movement.
//
// SYMMETRY IS THE POINT. Each pair's right projector is its left REFLECTED
// through x = 0 - not worked out separately - so the two are exact mirrors and
// stay so however the fan animates. Reflecting means negating x on the aim AND
// on both vectors spanning the fan's plane; do it to only some of them and the
// mirrored fan rolls the wrong way. Get the sign backwards, as this file did
// once, and half the rig fires into the wall behind it and is silently eaten.
//
// EACH PAIR IS ITS OWN INSTRUMENT. They do not come on together and they do
// not all answer the beat. Every four bars the phrase is recast: which pairs
// play at all, which BAR of the four each one enters on, and whether it STABS
// - dark between hits, snapping to a new angle on each one - or SUSTAINS,
// staying lit for the whole phrase while it turns slowly. Everything arriving
// at once on every beat is a single event repeated, and a room where three
// things are happening on three clocks is the one that feels alive.
//
// ONE DRAW CALL PER PAIR, and none for a pair that is dark. All twenty-two
// rays of a pair live in one BufferGeometry rewritten in place each frame.
// Nothing here allocates after construction and no light is created - a laser
// is geometry, so the rig's light-count contract is untouched.
import * as THREE from 'three';

// Rays per projector. Odd, so the fan has a centre ray to be symmetric about.
const RAYS = 11;
// Where the projectors stand: near the walls at about head height, so the rays
// rake ACROSS the room at the level the fight is played at rather than raining
// down from the truss.
const INSET = 20.5;
const HEIGHT = 2.4;
// A slight upward tilt on the aim. Dead level and the rays vanish into the far
// wall at one point; tilted, they climb across it.
const RISE = 0.1;
// Long enough to cross the room from any wall. The rays are depth-tested, so
// the room cuts them - which is what makes them look like they land somewhere
// rather than stopping in mid-air.
const LENGTH = 70;

// RAY WIDTH IS ANGULAR, NOT METRIC, and this is the difference between the
// bank being there and being invisible. A ribbon a fixed few centimetres wide
// is under a pixel across by the time it has crossed a forty-metre room, and
// sub-pixel geometry does not draw faint - it aliases out completely, so the
// far half of every ray simply is not there.
//
// A real laser behaves like a constant screen width: a line of the same
// apparent thickness however far away the part you are looking at is. So the
// ribbon is a TRAPEZOID, each end widened for its own distance from the
// camera, holding the same fraction of a pixel from end to end.
//
// PX is one pixel's worth of world size per unit of distance at this
// projection, 2*tan(fov/2)/height. WIDTH_PX is under one on purpose: a laser
// is a thread, and the thing that makes it read is its brightness against the
// dark, not its width. MIN_W keeps one passing right beside you from
// collapsing to nothing.
const PX = 0.0016;
const WIDTH_PX = 0.85;
const MIN_W = 0.012;

// Half-angle of the fan at its widest, in radians.
const SPREAD_MAX = 0.5;
const SPREAD_MIN = 0.16;
// How fast roll and spread ease to what the last cue asked for. Matched to the
// beams' own snap so the two instruments move on the same footing.
const EASE = 26;
// Radians a sustaining fan turns per second. Slow: it is lit the whole time,
// so it is the thing in the room that is NOT punctuating anything, and it
// should look like it has all night.
const SWEEP_RATE = 0.42;
// How fast a pair fades in or out when its bar arrives. Fast enough to read as
// a cue, not so fast it is a pop.
const ENTRY_EASE = 7;

// A sustaining fan's brightness, against a stab's peak. Well under it: a fan
// that is lit continuously would otherwise be the whole room, and it is meant
// to be the bed the stabs land on.
const SUSTAIN = 0.3;
const STAB = 0.95;

const STAB_MODE = 0;
const SUSTAIN_MODE = 1;

function distance(x, y, z, p) {
  const dx = x - p.x, dy = y - p.y, dz = z - p.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// One mirrored pair: two projectors, one mesh, one set of animation state.
class Bank {
  constructor(parent, z, aimZ) {
    // The LEFT projector, at -x, aiming across to +x. The right is this
    // reflected, which is the factor `m` below.
    const u = new THREE.Vector3(1, RISE, aimZ).normalize();
    const p = new THREE.Vector3(0, 1, 0);
    p.addScaledVector(u, -u.dot(p)).normalize();
    const q = new THREE.Vector3().crossVectors(u, p).normalize();
    this.emitters = [];
    for (const sx of [-1, 1]) {
      const m = -sx;
      this.emitters.push({
        pos: new THREE.Vector3(INSET * sx, HEIGHT, z),
        u: new THREE.Vector3(u.x * m, u.y, u.z),
        p: new THREE.Vector3(p.x * m, p.y, p.z),
        q: new THREE.Vector3(q.x * m, q.y, q.z),
      });
    }

    this.roll = Math.random() * Math.PI * 2;
    this.rollTo = this.roll;
    this.spread = SPREAD_MAX;
    this.spreadTo = SPREAD_MAX;
    this.mode = STAB_MODE;
    // Which bar of the four this pair joins on, and whether it plays at all.
    this.entry = 0;
    this.playing = false;
    this.on = false;
    // Eased 0..1 presence, so entering and leaving are cues rather than pops.
    this.gain = 0;

    const quads = this.emitters.length * RAYS;
    this._pos = new Float32Array(quads * 4 * 3);
    const index = new Uint16Array(quads * 6);
    for (let i = 0; i < quads; i++) {
      const v = i * 4, k = i * 6;
      index[k] = v; index[k + 1] = v + 1; index[k + 2] = v + 2;
      index[k + 3] = v; index[k + 4] = v + 2; index[k + 5] = v + 3;
    }
    this.geo = new THREE.BufferGeometry();
    const attr = new THREE.BufferAttribute(this._pos, 3);
    attr.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', attr);
    this.geo.setIndex(new THREE.BufferAttribute(index, 1));
    // The rays reach further than a bounding sphere inferred from any one
    // frame, and a wrong one frustum-culls the whole pair at the worst moment.
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 60);

    this.mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      // Depth TEST on, so a wall or a pillar cuts the ray and it looks like it
      // landed. Depth WRITE off, or the rays would occlude each other and the
      // crossings - the best part - would go away.
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    parent.add(this.mesh);
  }
}

export class Lasers {
  constructor(parent) {
    // Three pairs: the two ends of the room raking diagonally, and one across
    // the middle. Three rather than two so a phrase has something to withhold
    // - staggering two pairs only ever says "one" or "both".
    this.banks = [
      new Bank(parent, -INSET, 1),
      new Bank(parent, INSET, -1),
      new Bank(parent, 0, 0),
    ];
    // Scratch, so the per-frame maths allocates nothing.
    this._v = new THREE.Vector3();
    this._d = new THREE.Vector3();
    this._side = new THREE.Vector3();
    this._toCam = new THREE.Vector3();
  }

  // A new four-bar phrase. Recasts every pair: whether it plays, when it comes
  // in, and how it behaves while it is in.
  phrase() {
    let playing = 0;
    for (let i = 0; i < this.banks.length; i++) {
      const b = this.banks[i];
      // Two in three. Over a phrase that leaves the room usually holding two
      // of the three, which is enough to look full and still leave one out.
      b.playing = Math.random() < 0.66;
      if (b.playing) playing++;
      // Bar 0, 1 or 2 of the phrase. Never 3: a pair that arrives for the last
      // bar has not entered, it has flickered.
      b.entry = (Math.random() * 3) | 0;
      // One pair in three sustains. More than that and nothing is punctuating
      // anything; none and the room is back to one event repeated.
      b.mode = Math.random() < 0.34 ? SUSTAIN_MODE : STAB_MODE;
      if (b.mode === SUSTAIN_MODE) b.spreadTo = SPREAD_MIN + Math.random() * 0.2;
    }
    // Never leave the room with nothing. One pair is forced in from the top of
    // the phrase, which also guarantees something lands on the ONE.
    if (!playing) {
      const b = this.banks[(Math.random() * this.banks.length) | 0];
      b.playing = true;
      b.entry = 0;
    }
  }

  // A downbeat. `bar` is 0..3 through the phrase; a pair is in once its own
  // entry bar has come round.
  bar(index) {
    for (let i = 0; i < this.banks.length; i++) {
      const b = this.banks[i];
      b.on = b.playing && index >= b.entry;
    }
  }

  // A beat. Only the stabbing pairs take a cue from it - that is what "not all
  // of them are beat-synced" means, and a sustaining fan that jumped on the
  // beat would just be a stab that forgot to go dark.
  cue() {
    for (let i = 0; i < this.banks.length; i++) {
      const b = this.banks[i];
      if (b.mode !== STAB_MODE || !b.on) continue;
      // A big turn, either way. Small turns read as a fan that failed to move.
      b.rollTo += (0.3 + Math.random() * 0.5) * Math.PI * (Math.random() < 0.5 ? -1 : 1);
      b.spreadTo = SPREAD_MIN + Math.random() * (SPREAD_MAX - SPREAD_MIN);
    }
  }

  // `punch` is the beat envelope the beams also stab on; `master` is the look's
  // own multiplier and everything the room applies on top - house lights, the
  // blackout cue, energy.
  update(dt, camPos, colour, punch, master) {
    const ease = Math.min(1, dt * EASE);
    const entry = Math.min(1, dt * ENTRY_EASE);
    for (let i = 0; i < this.banks.length; i++) {
      const b = this.banks[i];
      b.gain += ((b.on ? 1 : 0) - b.gain) * entry;

      const lit = b.mode === SUSTAIN_MODE
        ? SUSTAIN * b.gain * master
        : STAB * punch * b.gain * master;
      b.mat.opacity = Math.min(0.85, lit);
      // A fully transparent mesh still rasterises every one of its pixels, and
      // these are long. Not drawing it at all is most of the budget.
      b.mesh.visible = b.mat.opacity > 0.006;
      if (!b.mesh.visible) continue;
      b.mat.color.copy(colour);

      if (b.mode === SUSTAIN_MODE) b.rollTo += SWEEP_RATE * dt * (i & 1 ? -1 : 1);
      b.roll += (b.rollTo - b.roll) * ease;
      b.spread += (b.spreadTo - b.spread) * ease;
      this._write(b, camPos);
    }
  }

  _write(b, camPos) {
    const pos = b._pos;
    const cr = Math.cos(b.roll), sr = Math.sin(b.roll);
    let o = 0;
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
        // Billboard: the ribbon's width runs across both the ray and the line
        // of sight, so it keeps its thickness however it is viewed. Edge-on
        // the cross collapses, which is correct - a laser aimed at your eye is
        // a dot.
        this._side.crossVectors(this._d, this._toCam);
        const len = this._side.length();
        if (len > 1e-5) this._side.multiplyScalar(1 / len);
        else this._side.set(0, 0, 0);

        const bx = ax + this._d.x * LENGTH;
        const by = ay + this._d.y * LENGTH;
        const bz = az + this._d.z * LENGTH;
        const wb = Math.max(MIN_W, distance(bx, by, bz, camPos) * PX * WIDTH_PX);
        const sx = this._side.x, sy = this._side.y, sz = this._side.z;
        pos[o] = ax + sx * wa; pos[o + 1] = ay + sy * wa; pos[o + 2] = az + sz * wa;
        pos[o + 3] = ax - sx * wa; pos[o + 4] = ay - sy * wa; pos[o + 5] = az - sz * wa;
        pos[o + 6] = bx - sx * wb; pos[o + 7] = by - sy * wb; pos[o + 8] = bz - sz * wb;
        pos[o + 9] = bx + sx * wb; pos[o + 10] = by + sy * wb; pos[o + 11] = bz + sz * wb;
        o += 12;
      }
    }
    b.geo.attributes.position.needsUpdate = true;
  }
}
