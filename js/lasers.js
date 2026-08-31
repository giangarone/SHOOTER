// The laser bank: three mirrored pairs of fan projectors hung on the truss,
// firing down and across the room.
//
// WHY THIS IS NOT MORE BEAMS. The beams in rig.js are soft textured cones that
// fade along their length - light you can see the air in. A laser is the
// opposite instrument: a hard-edged line of even width and colour that ends
// only where it hits something. Both in one room is what reads as a RIG rather
// than as one effect turned up.
//
// THE DIVISION OF LABOUR: the beams own the BEAT and the lasers own the
// MOVEMENT. Nothing in this file is gated on a hit. A fan comes on, stays on
// for its bars, and turns the whole time - a laser that blinked on every kick
// is a strobe wearing a laser's clothes, and next to beams that are already
// stabbing it is the same event twice. Lit and moving against a room that is
// punctuating around it is the contrast worth having.
//
// THE SHAPE IS A FAN, and a fan is two things at once: the RAYS, which are
// sharp and thin, and the SHEET between them, which is the haze the rays are
// cutting through lit from the side. Drawing only the rays gives a diagram of
// a fan; the soft wedge filling the angle is most of what makes it look like
// light in air. So each projector draws both, the wedge at a fraction of the
// rays' brightness.
//
// SYMMETRY IS THE POINT. Each pair's right projector is its left REFLECTED
// through x = 0 - not worked out separately - so the two are exact mirrors and
// stay so however the fan animates. Reflecting means negating x on the aim AND
// on both vectors spanning the fan's plane; do it to only some of them and the
// mirrored fan rolls the wrong way. Get the sign backwards, as this file did
// once, and half the rig fires into the wall behind it and is silently eaten.
//
// EACH PAIR IS ITS OWN INSTRUMENT. Every four bars the phrase is recast: which
// pairs play at all, and which BAR of the four each one enters on. Everything
// arriving together is a single event repeated; three pairs on three
// staggered entries is a room where something is always arriving.
//
// Nothing here allocates after construction, and no light is created - a laser
// is geometry, so the rig's light-count contract is untouched.
import * as THREE from 'three';

// Rays per projector. Odd, so the fan has a centre ray to be symmetric about,
// and few enough that each one still reads as a separate line rather than
// merging into a wall - the gaps between them are where the soft fill shows.
const RAYS = 9;

// WHERE THEY HANG. On the truss, under the ceiling, firing down and across.
// Not on the walls at head height, which is where they used to be: from there
// the rays leave from nowhere in the player's own plane and read as an effect
// drawn over the room rather than as fixtures in it.
const HEIGHT = 12.4;
// How steeply the aim drops. Shallow on purpose - at this pitch a ray from the
// truss runs about 36 metres before it reaches the floor, so it crosses the
// whole room on the way down instead of landing at the projector's feet.
const DROP = 0.42;
// Where each pair hangs: half-spacing across X, and its position along Z.
const RIG_POINTS = [
  { x: 16, z: -16, aimZ: 0.55 },
  { x: 16, z: 16, aimZ: -0.55 },
  { x: 19.5, z: 0, aimZ: 0 },
];
// Long enough to cross the room from anywhere in it. The rays are depth
// tested, so the room cuts them - which is what makes them look like they land
// somewhere rather than stopping in mid-air.
const LENGTH = 70;

// RAY WIDTH IS ANGULAR, NOT METRIC, and this is the difference between the
// bank being there and being invisible. A ribbon a fixed few centimetres wide
// is under a pixel across by the time it has crossed a forty-metre room, and
// sub-pixel geometry does not draw faint - without multisampling it aliases
// out completely, so the far half of every ray simply is not there.
//
// A real laser behaves like a constant screen width: a line of the same
// apparent thickness however far away the part you are looking at is. So the
// ribbon is a TRAPEZOID, each end widened for its own distance from the
// camera, holding the same fraction of a pixel from end to end.
//
// PX is one pixel's worth of world size per unit of distance at this
// projection, 2*tan(fov/2)/height. WIDTH_PX is well under one, which the
// renderer's multisampling turns into a thin line at partial coverage rather
// than a dashed one - it is only safe BECAUSE the canvas is antialiased. The
// brightness below is what compensates for the coverage lost.
const PX = 0.0016;
const WIDTH_PX = 0.55;
const MIN_W = 0.008;

// Half-angle of the fan at its widest, in radians.
const SPREAD_MAX = 0.52;
const SPREAD_MIN = 0.18;
// Radians a fan turns per second, and how fast its spread drifts. Slow: these
// are lit continuously, so they are the thing in the room NOT punctuating
// anything, and they should look like they have all night.
const SWEEP_RATE = 0.4;
const EASE = 1.6;
// How fast a pair fades in or out when its bar arrives. Fast enough to read as
// a cue, not so fast it is a pop.
const ENTRY_EASE = 7;

// Brightness of a lit fan, and the ceiling it is clamped to.
const SUSTAIN = 0.95;
const MAX_OP = 0.95;
// The soft wedge between the rays, against the rays' own brightness. Low: it
// is haze catching the light, not another ray, and it covers a hundred times
// the pixels so it is also where the fill rate would go if it were not.
const FILL = 0.13;
// The aperture never goes fully dark while its pair is up. A projector with a
// black lens is scenery; the glowing dot at the apex is what says the rays are
// coming OUT of something.
const APERTURE_FLOOR = 0.35;

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
        pos,
        u: dir,
        p: new THREE.Vector3(p.x * m, p.y, p.z),
        q: new THREE.Vector3(q.x * m, q.y, q.z),
      });
      // The fixture itself: a dark body aimed down the beam, with a glowing
      // lens at the muzzle end.
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
    // Which bar of the four this pair joins on, and whether it plays at all.
    this.entry = 0;
    this.playing = false;
    this.on = false;
    // Eased 0..1 presence, so entering and leaving are cues rather than pops.
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
      // Depth TEST on, so a wall or a pillar cuts the ray and it looks like it
      // landed. Depth WRITE off, or the rays would occlude each other and the
      // crossings - the best part - would go away.
      depthWrite: false, side: THREE.DoubleSide, fog: false,
    });
    this.rayMesh = new THREE.Mesh(this.rayGeo, this.rayMat);
    this.rayMesh.frustumCulled = false;
    this.rayMesh.renderOrder = 4;
    parent.add(this.rayMesh);

    // ---- the fill: a wedge spanning the angle between adjacent rays ---------
    const tris = this.emitters.length * (RAYS - 1);
    this._fillPos = new Float32Array(tris * 3 * 3);
    this.fillGeo = new THREE.BufferGeometry();
    this.fillGeo.setAttribute('position', dynamic(this._fillPos, 3));
    this.fillGeo.boundingSphere = this.rayGeo.boundingSphere;
    this.fillMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0,
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
    // One sphere and one dark material for every projector in the room.
    const apertureGeo = new THREE.SphereGeometry(0.17, 8, 6);
    const housingMat = new THREE.MeshBasicMaterial({ color: 0x0b0e14 });
    this.banks = RIG_POINTS.map((pt) => new Bank(parent, pt, boxGeo, apertureGeo, housingMat));
    this.banks.forEach((b, i) => { b.spin = i & 1 ? -1 : 1; });
    // Scratch, so the per-frame maths allocates nothing.
    this._v = new THREE.Vector3();
    this._d = new THREE.Vector3();
    this._side = new THREE.Vector3();
    this._toCam = new THREE.Vector3();
  }

  // A new four-bar phrase. Recasts every pair: whether it plays, and when it
  // comes in.
  phrase() {
    let playing = 0;
    for (let i = 0; i < this.banks.length; i++) {
      const b = this.banks[i];
      // Two in three. Over a phrase that usually leaves the room holding two
      // of the three, which is enough to look full and still withhold one.
      b.playing = Math.random() < 0.66;
      if (b.playing) playing++;
      // Bar 0, 1 or 2 of the phrase. Never 3: a pair that arrives for the last
      // bar has not entered, it has flickered.
      b.entry = (Math.random() * 3) | 0;
      b.spreadTo = SPREAD_MIN + Math.random() * (SPREAD_MAX - SPREAD_MIN);
      if (Math.random() < 0.4) b.spin = -b.spin;
    }
    // Never leave the room with nothing. One pair is forced in from the top of
    // the phrase if the dice took them all away.
    if (!playing) {
      const b = this.banks[(Math.random() * this.banks.length) | 0];
      b.playing = true;
      b.entry = 0;
    }
  }

  // A downbeat. `index` is 0..3 through the phrase; a pair is in once its own
  // entry bar has come round.
  bar(index) {
    for (let i = 0; i < this.banks.length; i++) {
      const b = this.banks[i];
      b.on = b.playing && index >= b.entry;
    }
  }

  // `master` is what the ROOM allows: the look's own multiplier, the energy,
  // the house lights and the blackout cue. Which pairs are lit is the bank's
  // own business, and no part of this answers the beat.
  update(dt, camPos, colour, master) {
    const ease = Math.min(1, dt * EASE);
    const entry = Math.min(1, dt * ENTRY_EASE);
    for (let i = 0; i < this.banks.length; i++) {
      const b = this.banks[i];
      b.gain += ((b.on ? 1 : 0) - b.gain) * entry;

      const lit = Math.min(MAX_OP, SUSTAIN * b.gain * master);
      b.rayMat.opacity = lit;
      b.fillMat.opacity = lit * FILL;
      // The lens stays bright while its pair is up even as the rays dim, so
      // the projector reads as a thing that is switched on.
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
  }

  _write(b, camPos) {
    const ray = b._rayPos;
    const fill = b._fillPos;
    const far = b._far;
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
        far[r * 3] = bx; far[r * 3 + 1] = by; far[r * 3 + 2] = bz;
        const wb = Math.max(MIN_W, distance(bx, by, bz, camPos) * PX * WIDTH_PX);
        const sx = this._side.x, sy = this._side.y, sz = this._side.z;
        ray[o] = ax + sx * wa; ray[o + 1] = ay + sy * wa; ray[o + 2] = az + sz * wa;
        ray[o + 3] = ax - sx * wa; ray[o + 4] = ay - sy * wa; ray[o + 5] = az - sz * wa;
        ray[o + 6] = bx - sx * wb; ray[o + 7] = by - sy * wb; ray[o + 8] = bz - sz * wb;
        ray[o + 9] = bx + sx * wb; ray[o + 10] = by + sy * wb; ray[o + 11] = bz + sz * wb;
        o += 12;
      }

      // The wedge: one triangle from the apex out to each adjacent pair of far
      // points, so the whole fan is a sheet with the sharp rays lying on it.
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
}
