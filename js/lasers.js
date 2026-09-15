// The laser bank: three mirrored pairs of fan projectors mounted low on the
// perimeter walls, firing up and across the room.
//
// WHY THIS IS NOT MORE BEAMS. The beams in rig.js are soft textured cones that
// fade along their length - light you can see the air in. A laser is the
// opposite instrument: a hard-edged line of even width and colour that ends
// only where it hits something. Both in one room is what reads as a RIG rather
// than as one effect turned up.
//
// THE DIVISION OF LABOUR: the beams own the BEAT, and most of the lasers own
// the MOVEMENT. A fan comes on, stays on for its bars, and turns the whole
// time. The occasional PHRASE pulses instead - the whole bank at once,
// rarely, so the beat is not something the lasers are entirely deaf to - but
// it stays the exception on purpose, because every fan blinking on every kick
// next to four beams already stabbing is the same event twice. The beat-cued
// move below answers the kick with MOTION instead of brightness: a fan that
// OPENS on the kick is choreography, a fan that flashes on the kick is a
// thinner beam.
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
// The moves that let the two halves diverge - COUNTER, WEAVE, ALTERNATE -
// diverge ONLY in mirrored or bar-gridded ways, so the pair still reads as
// one rig doing one thing with two hands.
//
// NOTHING STAYS ON. A pair plays for at most one phrase and then has to sit
// out. Light that is always there stops being an event, and the room only has
// moments if it also has gaps.
//
// THE VOCABULARY. What a pair DOES with its bars is a move: a slow sweep, a
// searchlight's pendulum, a fan that breathes open and shut on the bars, one
// that blooms wide on the kick and folds back, one that spins up through the
// phrase into a rush - and three that let a pair's two projectors leave the
// shared axis without ever leaving the choreography: COUNTER rolls the two
// fans against each other, WEAVE runs them half a ray-step apart so their
// lines interleave, and ALTERNATE hands the room from one projector to the
// other bar by bar. How the three pairs SHARE the four bars is cast alongside
// the move, from FORMATIONS: roam - each pair on its own schedule, the
// default - a chase handing the room bar by bar, a stack of entries one per
// bar, a call-and-answer split of even and odd bars, and, rarely and all
// together, unison, which also locks every pair to one roll.
//
// ONE PATTERN AT A TIME. The move - and whether the phrase pulses or ripples
// - is cast ONCE per phrase and shared by every playing pair. Two fans doing
// two different dances at once is not a show, it is a rehearsal. What varies
// within a phrase is only WHEN each pair is lit and which way it turns: the
// texture of the phrase, never its dance.
//
// WHAT NO MOVE MAY DO. Every pattern in this file plays out in the fan's
// roll, its spread, its shutter and its per-ray shimmer. None of them may
// touch the AIM, and spread is clamped to SPREAD_MAX every frame. The
// placement law in test/lasers.mjs sweeps roll across a full circle and
// spread to its maximum, so every position any move can produce is one the
// law has already covered - the vocabulary can grow without the floor of the
// room ever being in doubt.
//
// EVERY RAY IN HERE BELONGS TO A FAN. There was a pool of loose single rays
// for a while - fired off random beats, in random directions, from random
// points around the rig - on the theory that a room entirely on the grid
// reads as a screensaver. It does not work. A lone ray with no fan behind it
// does not read as a laser off doing its own thing; it reads as one that has
// come adrift from the rig, and the rig is what the room is selling.
//
// Nothing here allocates after construction, and no light is created - a laser
// is geometry, so the rig's light-count contract is untouched.
import * as THREE from 'three';
import { BOUND, CEIL_Y } from './arena.js';

// Rays per projector. Odd, so the fan has a centre ray to be symmetric about,
// and few enough that each still reads as a line rather than merging into a
// wall - the gaps between them are where the soft fill shows.
const RAYS = 9;

// WHERE THEY STAND. Low on the perimeter walls, firing up and across the
// room. They used to hang on the truss and rake the whole floor, which was
// the strongest look in the venue and also the problem: the centre is where
// the fight lives, and a fan whose rays cross it puts nine moving lines
// through the space the player is trying to read. From the floor the same
// fans put those lines across the ceiling and the upper walls instead, and
// the centre keeps only the short bright run off the lens, out at the
// perimeter.
const HEIGHT = 1.3;
// HOW FAR OFF THE WALL, measured in from BOUND. The terrain grid stops at
// +-20 (see GRID_CELL in terrain.js), so this lane is the one strip of floor
// no wave can ever build in: nothing a layout generates can stand in front
// of a projector, and no aim has to be tuned around cover that changes
// every wave. Bodies still pass through the lane - the clamps let them -
// but the mounts do not path, collide or read as furniture, so passing
// through one now and then is invisible against a wall of doors and cables.
const LANE = 0.8;
// THE ONE NUMBER THIS MOVE HAS TO GET RIGHT. The fan's plane rolls around
// the aim the whole time a pair is lit (see SWEEP_RATE), so over a bar the
// lens fires every direction within SPREAD_MAX of the aim - including
// spread BELOW the aim's own elevation. A ray aimed below horizontal from
// 1.3m sails across the room at head height, which is exactly the
// obstruction the bank was moved to the walls to end. So the aim's
// elevation is held above the fan's own half-width plus a clearance: at
// RISE 1.2 the shallowest ray any projector can fire still climbs at
// about 17 degrees, is above a boss's head by the time it crosses the open
// centre, and can only land on the ceiling or the upper reach of a wall.
// test/lasers.mjs holds this as a law, over every roll and spread.
const RISE = 1.2;
// The three pairs, by where they sit along the walls. All six mount on the
// +-x walls, mirrored through x = 0; the z spots -16, 16, 0 give the bank
// its spread, and the old x offsets are gone: the mount is derived from
// BOUND now, not tuned per pair.
const RIG_POINTS = [
  { z: -16, aimZ: 0.55 },
  { z: 16, aimZ: -0.55 },
  { z: 0, aimZ: 0 },
];

// WHERE A RAY STOPS. Not at a fixed length with the depth buffer cutting it -
// that was the old way and it is what put a hard edge across a surface. Every
// ray is intersected with the room box and ends exactly where it lands, which
// buys two things: the wedge's fade reaches zero AT the surface instead of
// being sliced open at whatever brightness it happened to be, and a short ray
// fades over its own length rather than being cut off part-way through its
// gradient.
//
// AND IT HANDLES THE TERRAIN TOO, now that there is terrain to handle. The
// depth test always hid the part of a ray that had passed behind a platform,
// but the ray still ARRIVED at the far wall - so its fade was spent on
// distance it never travelled, and the landing spot was painted on a wall the
// beam could not reach. setColliders() hands the bank the boxes generated
// terrain put in the room, and _exit() stops the ray on the nearest one.
//
// DELIBERATELY NOT EVERY BOX. TerrainSet only offers up pieces at least 1.5m
// tall and 2m across (see its collect()): a fan clipping on knee-high crates
// flickers on every sweep and reads as static rather than as light landing on
// something.
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
// Chance the PHRASE pulses rather than sustains, cast once for the whole
// bank: every lit pair on the kick, or none of them. Cut from the old
// per-pair odds - a whole bank stabbing with the beams is a much bigger
// statement than one fan doing it, so it has to be rarer to stay one.
const PULSE_CHANCE = 0.22;
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

// ---- the moves -------------------------------------------------------------
// What the lit pairs DO with their bars: one move, cast once per phrase and
// shared by every playing pair - see the ONE PATTERN AT A TIME note at the
// top of this file. `pulse` marks a move as safe for a PULSING phrase: a
// pulsing pair's shutter is dark most of each beat, which freezes its clock,
// so only moves that integrate their own motion survive that - the pendulum's
// absolute phase would jump once per beat, and it is the one move a pulsing
// phrase never draws.
const MOVE_SWEEP = 0;
const MOVE_PENDULUM = 1;
const MOVE_BREATHE = 2;
const MOVE_BLOOM = 3;
const MOVE_RUSH = 4;
const MOVE_COUNTER = 5;
const MOVE_ALTERNATE = 6;
const MOVE_WEAVE = 7;
const MOVES = [
  { m: MOVE_SWEEP, w: 0.24, pulse: true },     // the classic: constant slow roll
  { m: MOVE_PENDULUM, w: 0.16, pulse: false }, // a searchlight's swing across the ceiling
  { m: MOVE_BREATHE, w: 0.14, pulse: true },   // open on one bar, shut on the next
  { m: MOVE_BLOOM, w: 0.12, pulse: true },     // snapped open by the kick, easing shut
  { m: MOVE_RUSH, w: 0.12, pulse: true },      // a wind-up across the phrase's bars
  { m: MOVE_COUNTER, w: 0.10, pulse: true },   // the pair's two fans roll against each other
  { m: MOVE_ALTERNATE, w: 0.07, pulse: true }, // the pair trades the room bar by bar
  { m: MOVE_WEAVE, w: 0.05, pulse: true },     // half a ray-step apart, lines interlaced
];
// PENDULUM's swing: how far either side of its starting roll, and how fast in
// radians a second. Slow - a sway periods of two to three bars, not a waggle.
const PEND_AMP_MIN = 0.5, PEND_AMP_MAX = 1.05;
const PEND_RATE_MIN = 1.3, PEND_RATE_MAX = 2.1;
// BLOOM's resting spread. The kick snaps the fan to SPREAD_MAX and the usual
// ease pulls it back here; it has to start narrow or there is nothing to
// bloom from.
const BLOOM_REST = 0.08;
// RUSH's wind-up, the multiplier on SWEEP_RATE per bar of the phrase. The
// last bar spins at four times the resting rate, and then the phrase ends -
// a rush that never pays off its speed inside its own phrase is what the next
// bank's entry is for.
const RUSH_MUL = [0.6, 1.7, 2.8, 3.9];
// ALTERNATE's dimmed projector: a floor, not a zero. A dark half of a pair
// reads as a broken projector; a low one reads as waiting for its bar. SWAP
// is how fast the trade crosses - time constant a sixth of a second, fast
// enough to belong to the bar that cued it and slow enough not to flicker.
const ALT_LOW = 0.12;
const ALT_SWAP = 6;

// ---- the formations --------------------------------------------------------
// How the three pairs divide the four bars of a phrase. ROAM is the everyday
// cast and keeps the weight: the rest are moments, and a moment every phrase
// is not one.
const FORM_ROAM = 0;
const FORM_CHASE = 1;   // one pair per bar, handed around the room
const FORM_STACK = 2;   // one entry per bar, a crescendo across the phrase
const FORM_ANSWER = 3;  // even bars against odd bars
const FORM_UNISON = 4;  // every pair, one cast of the dice, the stadium moment
const FORMATIONS = [
  { f: FORM_ROAM, w: 0.55 },
  { f: FORM_CHASE, w: 0.14 },
  { f: FORM_STACK, w: 0.12 },
  { f: FORM_ANSWER, w: 0.11 },
  { f: FORM_UNISON, w: 0.08 },
];
// Chance a ROAM pair plays its phrase - the same odds the bank was built with.
const ROAM_PLAY = 0.66;

// The RIPPLE: a shimmer running along a fan's rays in the spin's direction.
// Brightness lives in the ray ribbons' vertex alpha, so the ripple is per-ray
// even though the fan's lamp is one material.
const RIPPLE_CHANCE = 0.35;
const RIPPLE_RATE = 9;
const RIPPLE_STEP = 0.85;
const RIPPLE_DEPTH = 0.45;

// Weighted pick from a {w} table, optionally restricted to the entries a
// predicate allows. Used for the move a playing pair draws and the formation
// the phrase takes.
function pickWeighted(table, allow) {
  let total = 0;
  for (const e of table) if (!allow || allow(e)) total += e.w;
  let r = Math.random() * total;
  for (const e of table) {
    if (allow && !allow(e)) continue;
    r -= e.w;
    if (r <= 0) return e;
  }
  return table[table.length - 1];
}

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
// ONE MESH FOR EVERY IMPACT IN THE ROOM, because each impact's brightness is
// written into its own vertices rather than taken from the material. That is also what lets a pulsing pair's spots pulse while
// a sustaining pair's hold, on the same draw call.
const IMPACT_SEGS = 6;
const IMPACT_SLOTS = 3 * 2 * RAYS;
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
    // The LEFT projector, at -x, aiming across to +x and upward. The right
    // is this reflected, which is the factor `m` below.
    const u = new THREE.Vector3(1, RISE, point.aimZ).normalize();
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
      // The mount: on one +-x wall, LANE in from the face. sx picks which
      // side of the mirror this emitter sits on, and the same sign which
      // way the pair aims - the right projector is the left one reflected,
      // exactly as the fan vectors below it are.
      const pos = new THREE.Vector3(sx * (BOUND - LANE), HEIGHT, point.z);
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
      // The mount arm: the housing read as bolted to nothing when it hung in
      // the air by the wall. A short bar from the wall face into the
      // housing's underside makes it a fixture.
      const arm = new THREE.Mesh(boxGeo, housingMat);
      arm.position.set(sx * (BOUND - 0.35), HEIGHT - 0.45, point.z);
      arm.scale.set(0.95, 0.16, 0.22);
      parent.add(arm);
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
    this.playing = false;
    this.on = false;
    this.barsOn = 0;
    // 0 or 1, never in between: see the note on the instant gate in update().
    this.gain = 0;

    // ---- the choreography state --------------------------------------------
    // Which move the pair is playing this phrase, the 4-bit mask of the
    // phrase's bars it may light, and its clock within the phrase. The mask
    // is the single source of truth for WHEN a pair is lit: formations write
    // it, bar() reads it.
    this.move = MOVE_SWEEP;
    this.mask = 0xF;
    this.t = 0;
    this.spent = false;
    // RUSH's wind-up, PENDULUM's swing, BREATHE's phase, and the two
    // projectors' relative brightness - targets and eased values - for the
    // moves that split a pair. All plain scalars cast by phrase() once per
    // four bars.
    this.rushMul = 1;
    this.rollBase = this.roll;
    this.pendAmp = 0;
    this.pendRate = 0;
    this.breathePhase = 0;
    this.emGain0 = 1;
    this.emGain1 = 1;
    this.emTgt0 = 1;
    this.emTgt1 = 1;
    this.ripple = false;

    // ---- the rays: one camera-facing ribbon per ray -------------------------
    const quads = this.emitters.length * RAYS;
    this._rayPos = new Float32Array(quads * 4 * 3);
    // Per-vertex colour so the ripple can run a shimmer ALONG the fan: every
    // ray of a pair shares one material, so a ray-to-ray difference has to
    // live on the vertices. r/g/b pin at 1; the alpha is rewritten per frame.
    this._rayCol = new Float32Array(quads * 4 * 4);
    for (let i = 0; i < quads * 4; i++) {
      const c = i * 4;
      this._rayCol[c] = 1; this._rayCol[c + 1] = 1; this._rayCol[c + 2] = 1;
      this._rayCol[c + 3] = 1;
    }
    const rayIdx = new Uint16Array(quads * 6);
    for (let i = 0; i < quads; i++) {
      const v = i * 4, k = i * 6;
      rayIdx[k] = v; rayIdx[k + 1] = v + 1; rayIdx[k + 2] = v + 2;
      rayIdx[k + 3] = v; rayIdx[k + 4] = v + 2; rayIdx[k + 5] = v + 3;
    }
    this.rayGeo = new THREE.BufferGeometry();
    this.rayGeo.setAttribute('position', dynamic(this._rayPos, 3));
    this.rayGeo.setAttribute('color', dynamic(this._rayCol, 4));
    this.rayGeo.setIndex(new THREE.BufferAttribute(rayIdx, 1));
    // The rays reach further than a bounding sphere inferred from any one
    // frame, and a wrong one frustum-culls the pair at the worst moment.
    this.rayGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 70);

    this.rayMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0, vertexColors: true,
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
    // What a ray stops on besides the room itself. Replaced wholesale between
    // waves and emptied for the wave break, when the floor is bare.
    this._colliders = [];
    const apertureGeo = new THREE.SphereGeometry(0.17, 8, 6);
    const housingMat = new THREE.MeshBasicMaterial({ color: 0x0b0e14 });
    this.banks = RIG_POINTS.map((pt) => new Bank(parent, pt, boxGeo, apertureGeo, housingMat));
    this.banks.forEach((b, i) => { b.spin = i & 1 ? -1 : 1; });

    // ---- the phrase's one cast ---------------------------------------------
    // The move, its brightness behaviour and its shimmer are decided ONCE per
    // phrase and shared by every playing pair (see the header). Only the
    // formation - which bars each pair lights - is per-pair, and the spin,
    // which alternates around the room and flips all at once when it flips.
    this._move = MOVE_SWEEP;
    this._pulsing = false;
    this._ripple = false;
    this._spreadTo = SPREAD_MAX;
    this._pendAmp = 0;
    this._pendRate = 0;

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

  /**
   * The terrain a ray may land on. Plain AABBs from terrain.js; an empty list
   * puts the bank back to the room-only behaviour it had before there was any.
   */
  setColliders(list) {
    this._colliders = list || [];
  }

  // How far a ray from (ox,oy,oz) along (dx,dy,dz) travels before it hits
  // something, and which face it hits. Slab intersection, nearest positive
  // hit: first against the six planes of the room, then against each terrain
  // box, keeping whichever is nearest.
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
    // Then the terrain. A box is three pairs of slabs: clip the ray's [0, t]
    // range against each pair in turn, and if a range survives all three the
    // ray is inside the box from t0 onward. The axis that produced t0 is the
    // face it entered through, which is what gives the impact decal its
    // orientation - the same trick the room test above uses.
    for (const b of this._colliders) {
      let t0 = 0;
      let t1 = t;
      let ax = -1;
      let sg = 1;
      // x
      if (Math.abs(dx) < 1e-6) {
        if (ox <= b.min.x || ox >= b.max.x) continue;
      } else {
        const inv = 1 / dx;
        let ta = (b.min.x - ox) * inv;
        let tb = (b.max.x - ox) * inv;
        let s0 = dx > 0 ? -1 : 1;
        if (ta > tb) { const q = ta; ta = tb; tb = q; }
        if (ta > t0) { t0 = ta; ax = 0; sg = s0; }
        if (tb < t1) t1 = tb;
        if (t0 > t1) continue;
      }
      // y
      if (Math.abs(dy) < 1e-6) {
        if (oy <= b.min.y || oy >= b.max.y) continue;
      } else {
        const inv = 1 / dy;
        let ta = (b.min.y - oy) * inv;
        let tb = (b.max.y - oy) * inv;
        let s0 = dy > 0 ? -1 : 1;
        if (ta > tb) { const q = ta; ta = tb; tb = q; }
        if (ta > t0) { t0 = ta; ax = 1; sg = s0; }
        if (tb < t1) t1 = tb;
        if (t0 > t1) continue;
      }
      // z
      if (Math.abs(dz) < 1e-6) {
        if (oz <= b.min.z || oz >= b.max.z) continue;
      } else {
        const inv = 1 / dz;
        let ta = (b.min.z - oz) * inv;
        let tb = (b.max.z - oz) * inv;
        let s0 = dz > 0 ? -1 : 1;
        if (ta > tb) { const q = ta; ta = tb; tb = q; }
        if (ta > t0) { t0 = ta; ax = 2; sg = s0; }
        if (tb < t1) t1 = tb;
        if (t0 > t1) continue;
      }
      // ax < 0 means the ray started inside the box on every axis it could be
      // clipped on. Nothing to land on: the projectors stand in the wall lane
      // where nothing generated can reach them (see LANE above), so this only
      // ever happens to a degenerate ray, and letting it through is better
      // than stopping it dead at zero length.
      if (ax < 0 || t0 <= 0.6 || t0 >= t) continue;
      t = t0;
      axis = ax;
      sign = sg;
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

  // Hand a playing pair its share of the phrase's cast. The move, its
  // pulsing and its ripple live on the BANK OF BANKS (this._move etc.) - the
  // phrase's one pattern - and only the pieces that exist to differ DO:
  // the breathing fans alternate phase by where they sit, and a pendulum
  // starts from wherever its own fan happens to be.
  _castMove(b, i) {
    b.move = this._move;
    b.pulsing = this._pulsing;
    b.ripple = this._ripple;
    // A pair leaving the phrase mid-trade could carry a dimmed projector
    // into the next one; every cast of any move starts with both halves up.
    b.emGain0 = 1;
    b.emGain1 = 1;
    b.emTgt0 = 1;
    b.emTgt1 = 1;
    b.spreadTo = this._spreadTo;
    switch (b.move) {
      case MOVE_PENDULUM:
        // Swing from wherever the fan happens to be, so the phrase boundary
        // never shows as a cut.
        b.rollBase = b.roll;
        b.pendAmp = this._pendAmp;
        b.pendRate = this._pendRate;
        break;
      case MOVE_BREATHE:
        // The pairs take their phase from their place in the room: banks 0
        // and 2 open together, bank 1 answers - the breathing is an argument
        // across the floor, not three unrelated lungs.
        b.breathePhase = i & 1;
        b.spread = (SPREAD_MIN + SPREAD_MAX) * 0.5;
        b.spreadTo = b.spread;
        break;
      case MOVE_BLOOM:
        b.spread = SPREAD_MIN + Math.random() * BLOOM_REST;
        b.spreadTo = b.spread;
        break;
      case MOVE_RUSH:
        b.rushMul = RUSH_MUL[0];
        break;
    }
  }

  // A new four-bar phrase. First the FORMATION: which bars of the phrase
  // each pair may light, as a 4-bit mask. Then the cast: what each playing
  // pair DOES with those bars.
  phrase() {
    const n = this.banks.length;
    let free = 0;
    for (const b of this.banks) {
      // A pair that ran the whole of the last phrase sits this one out.
      // barsOn lags a bar behind the truth, though: the increment for a
      // phrase's last bar lands at the NEXT bar() call, which is already the
      // next phrase. A pair still lit at the boundary is therefore counted
      // for the bar it is standing in - without that a four-bar run reads as
      // three and the sit-out never fires. Together with the cap in bar()
      // this is what bounds any pair's run of continuous light.
      b.spent = b.barsOn + (b.on ? 1 : 0) >= MAX_BARS;
      b.barsOn = 0;
      // ...and the shutter is closed so bar(0)'s count does not credit the
      // NEW phrase with the bar just accounted into `spent`. Left true, a
      // pair playing through a boundary is charged five bars for four and
      // dies one bar early, in the close of the phrase.
      b.on = false;
      b.t = 0;
      b.playing = false;
      b.mask = 0;
      if (!b.spent) free++;
    }

    // When every pair is spent the phrase is dark, whatever the dice said -
    // the bank catching its breath, which is what a unison is meant to be
    // followed by. No formation overrides the sit-out rule.
    const form = free > 0 ? pickWeighted(FORMATIONS).f : -1;
    if (form === FORM_CHASE) {
      // One pair per bar, the room handed around in a circle. With three
      // pairs and four bars the first pair takes the last bar too - the hand
      // that opened the phrase closes it.
      let at = (Math.random() * n) | 0;
      const step = Math.random() < 0.5 ? 1 : n - 1;
      for (let bar = 0; bar < 4; bar++) {
        let tries = 0;
        while (tries < n && this.banks[at].spent) { at = (at + 1) % n; tries++; }
        this.banks[at].playing = true;
        this.banks[at].mask |= 1 << bar;
        at = (at + step) % n;
      }
    } else if (form === FORM_STACK) {
      // One entry per bar from a random pair onwards: by bar two the whole
      // bank is up, and how it got there is the phrase's shape.
      let e = 0;
      const start = (Math.random() * n) | 0;
      for (let k = 0; k < n; k++) {
        const b = this.banks[(start + k) % n];
        if (b.spent) continue;
        b.playing = true;
        b.mask = (0xF << e) & 0xF;
        if (e < 3) e++;
      }
    } else if (form === FORM_ANSWER) {
      // Even bars against odd: the outer pairs ask, the middle pair replies,
      // or the other way round.
      const lead = Math.random() < 0.5 ? 0x5 : 0xA;
      for (let i = 0; i < n; i++) {
        const b = this.banks[i];
        if (b.spent) continue;
        b.playing = true;
        b.mask = (i & 1) === 0 ? lead : 0xF ^ lead;
      }
    } else if (form === FORM_UNISON) {
      for (const b of this.banks) {
        if (b.spent) continue;
        b.playing = true;
        b.mask = 0xF;
      }
    } else {
      // FORM_ROAM: each pair on its own schedule, the everyday cast.
      for (const b of this.banks) {
        b.playing = !b.spent && Math.random() < ROAM_PLAY;
        if (!b.playing) continue;
        // Bar 0, 1 or 2 of the phrase, held to the end of it. Never 3: a
        // pair that arrives for the last bar has not entered, it has
        // flickered.
        b.mask = (0xF << ((Math.random() * 3) | 0)) & 0xF;
      }
    }

    // Never leave the room with nothing while any pair still has light to
    // give. If every pair genuinely is spent the phrase stays dark - the bank
    // catching its breath, which is what the phrase after a unison is.
    let lit = false;
    for (const b of this.banks) if (b.playing && b.mask) { lit = true; break; }
    if (!lit) {
      for (const b of this.banks) {
        if (!b.spent) { b.playing = true; b.mask = 0xF; break; }
      }
    }

    // The CLOSE of a phrase must land. Every formation above covers bar three
    // by construction save one gap - an ANSWER whose only live pairs drew the
    // even bars - so enforce it here rather than trust the case analysis:
    // the suite in test/lasers.mjs holds it as law.
    let closer = false;
    for (const b of this.banks) if (b.playing && (b.mask & 8)) closer = true;
    if (!closer) {
      for (const b of this.banks) {
        if (b.playing) { b.mask |= 8; break; }
      }
    }

    // THE PHRASE'S ONE PATTERN. Pulsing is drawn first because a pulsing
    // phrase freezes each pair's clock while its shutter is dark, which
    // excludes the pendulum (its phase is absolute - see MOVES). UNISON is
    // further restricted to the moves a shared roll can carry: the bar- and
    // beat-cued ones would fire identically on every pair anyway, and three
    // banks snapping open on the same kick three feet apart is one bloom.
    this._pulsing = Math.random() < PULSE_CHANCE;
    const unison = form === FORM_UNISON;
    const uniOpts = this._pulsing
      ? [MOVE_SWEEP, MOVE_BREATHE] : [MOVE_SWEEP, MOVE_PENDULUM, MOVE_BREATHE];
    this._move = unison ? uniOpts[(Math.random() * uniOpts.length) | 0]
      : pickWeighted(MOVES, (e) => !this._pulsing || e.pulse).m;
    this._ripple = Math.random() < RIPPLE_CHANCE;
    this._spreadTo = SPREAD_MIN + Math.random() * (SPREAD_MAX - SPREAD_MIN);
    this._pendAmp = PEND_AMP_MIN + Math.random() * (PEND_AMP_MAX - PEND_AMP_MIN);
    this._pendRate = PEND_RATE_MIN + Math.random() * (PEND_RATE_MAX - PEND_RATE_MIN);
    // The spin flip - 40%, as it always was - now flips every pair at once:
    // adjacent pairs still counter-rotate, and the room's handedness changing
    // together is a cue, not a coincidence.
    if (Math.random() < 0.4) for (const b of this.banks) b.spin = -b.spin;
    // UNISON's extra lock: every pair starts from the same roll, so the fans
    // are not just doing the same move but standing in the same shape.
    const rollSeed = Math.random() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const b = this.banks[i];
      if (!b.playing) continue;
      if (unison) b.roll = rollSeed;
      this._castMove(b, i);
    }
  }

  // A downbeat. `index` is 0..3 through the phrase; a pair lights on the bars
  // its mask allows and goes out the moment it has had its four. The bar is
  // also the cue two moves take: BREATHE changes its spread target on the
  // phrase's own grid, and RUSH winds its spin up bar by bar.
  bar(index) {
    for (let i = 0; i < this.banks.length; i++) {
      const b = this.banks[i];
      if (b.on) b.barsOn++;
      b.on = b.playing && ((b.mask >> index) & 1) === 1 && b.barsOn < MAX_BARS;
      if (b.move === MOVE_BREATHE) {
        b.spreadTo = ((index + b.breathePhase) & 1) ? SPREAD_MIN : SPREAD_MAX;
      } else if (b.move === MOVE_RUSH) {
        b.rushMul = RUSH_MUL[index];
      } else if (b.move === MOVE_ALTERNATE) {
        // The pair trades on the bar grid: even bars belong to one
        // projector, odd bars to the other, and every pair in the room
        // trades together - the whole phrase is one call and answer.
        const even = (index & 1) === 0;
        b.emTgt0 = even ? 1 : ALT_LOW;
        b.emTgt1 = even ? ALT_LOW : 1;
      }
    }
  }

  // A beat, called from the rig's beat edge. Only BLOOM answers it: snap
  // straight to the widest fan and let update() ease it shut, which is what
  // makes this a bloom rather than a second gate. Dark-safe, since a pair
  // that is off takes its cues invisibly and simply arrives already open.
  beat() {
    for (let i = 0; i < this.banks.length; i++) {
      const b = this.banks[i];
      if (b.move === MOVE_BLOOM) b.spread = SPREAD_MAX;
    }
  }

  // `punch` is the beat envelope the beams stab on, read only by the pairs
  // that pulse. `master` is what the ROOM allows: the look's multiplier, the
  // energy, the wave break and the blackout cue.
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

      // The move's motion. Everything integrates except the pendulum, whose
      // absolute phase is safe precisely because a pulsing pair - whose clock
      // freezes whenever its shutter is dark - never draws it: see MOVES.
      b.t += dt;
      if (b.move === MOVE_PENDULUM) {
        b.roll = b.rollBase + Math.sin(b.t * b.pendRate) * b.pendAmp * b.spin;
      } else if (b.move === MOVE_RUSH) {
        b.roll += SWEEP_RATE * b.rushMul * dt * b.spin;
      } else {
        b.roll += SWEEP_RATE * dt * b.spin;
      }
      if (b.move === MOVE_ALTERNATE) {
        const swap = Math.min(1, dt * ALT_SWAP);
        b.emGain0 += (b.emTgt0 - b.emGain0) * swap;
        b.emGain1 += (b.emTgt1 - b.emGain1) * swap;
      }
      b.spread += (b.spreadTo - b.spread) * ease;
      // Not just tidiness: this ceiling is what the placement law proves
      // against. No move may ever open wider than the sweep in
      // test/lasers.mjs has covered.
      if (b.spread > SPREAD_MAX) b.spread = SPREAD_MAX;
      this._write(b, camPos, lit * IMPACT_GAIN);
    }

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
    const ray = b._rayPos, col = b._rayCol, fill = b._fillPos, far = b._far;
    let o = 0, f = 0;
    for (let e = 0; e < b.emitters.length; e++) {
      const em = b.emitters[e];
      // The fan's plane: the aim, and one vector rolled around it. The two
      // halves of a pair share a roll - EXCEPT under the moves that set them
      // apart on purpose. COUNTER rolls the right projector backwards, which
      // against its mirrored frame is the true mirror of the left's motion;
      // WEAVE offsets it by half a ray-step, so its lines land exactly in
      // the left fan's gaps however wide the fan is currently open.
      let rollE = b.roll;
      if (e === 1) {
        if (b.move === MOVE_COUNTER) rollE = -rollE;
        else if (b.move === MOVE_WEAVE) rollE += b.spread / (RAYS - 1);
      }
      const cr = Math.cos(rollE), sr = Math.sin(rollE);
      this._v.copy(em.p).multiplyScalar(cr).addScaledVector(em.q, sr);
      this._toCam.copy(camPos).sub(em.pos);
      const ax = em.pos.x, ay = em.pos.y, az = em.pos.z;
      const wa = Math.max(MIN_W, distance(ax, ay, az, camPos) * PX * WIDTH_PX);
      // ALTERNATE's trade rides the same vertex-alpha channel the ripple
      // does: this projector's share of the pair's light this bar.
      const emGain = e === 0 ? b.emGain0 : b.emGain1;

      for (let r = 0; r < RAYS; r++) {
        const a = ((r / (RAYS - 1)) * 2 - 1) * b.spread;
        const ca = Math.cos(a), sa = Math.sin(a);
        this._d.copy(em.u).multiplyScalar(ca).addScaledVector(this._v, sa);
        // The ripple: a shimmer running along the fan in the spin's
        // direction. The fan stays whole - the depth bottoms out well above
        // a ray anyone could call missing.
        const shim = (b.ripple
          ? 1 - RIPPLE_DEPTH * (0.5 + 0.5 * Math.sin(b.t * RIPPLE_RATE + r * RIPPLE_STEP * b.spin))
          : 1) * emGain;
        o = this._ribbon(ray, col, o, ax, ay, az, this._d, wa, camPos, far, r, spot * shim, shim);
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
    b.rayGeo.attributes.color.needsUpdate = true;
    b.fillGeo.attributes.position.needsUpdate = true;
  }

  // Writes one camera-facing ribbon and returns the new write offset. `far`,
  // when given, receives the ray's landing point for the fill to reuse.
  // `alpha` is the ripple's per-ray brightness, shared with this ray's impact
  // spot so a ray and its landing dot shimmer as one light.
  _ribbon(buf, col, o, ax, ay, az, d, wa, camPos, far, slot, spot, alpha) {
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
    // The ribbon's four vertices are one ray's share of the colour buffer:
    // rgba each, sixteen floats, alpha everywhere and tint pinned at one.
    const c = ((o / 12) | 0) * 16;
    col[c + 3] = alpha; col[c + 7] = alpha; col[c + 11] = alpha; col[c + 15] = alpha;
    return o + 12;
  }
}
