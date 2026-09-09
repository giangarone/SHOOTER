// VOID's six enemies and its boss.
//
// One file per theme, and it imports NOTHING from any other theme - see
// shared.js for why. What is here is this theme's stat blocks, its models, its
// behaviour and the constants only it uses; anything a second theme wanted is
// in shared.js by construction.
//
// The entries are registered into ENEMY_TYPES at the bottom rather than
// exported for someone else to assemble, so importing this file is what puts
// the theme in the game and index.js is a list of imports rather than a table
// that has to be kept in step with ten others.

import * as THREE from 'three';
import {
  resolveCircle, pointInObstacle,
} from '../utils.js';
import {
  BOSS_REACH_Y, ENEMY_TYPES, SHARED_MATS, _blinkAt, _blinkFrom, _blinkFwd,
  _bossAt, _hexFrom, _hexTo, _reachY, aiMelee, aiShrike, eyes, geo, orbit,
  partsFor, prism, releaseMarks, shard, slab, spike,
} from './shared.js';

// VOID's three. Every number here is about SPACE - how long a hole in the air
// hangs before something comes out of it, how long the player is held, and how
// little a slab that ignores the walls has to be slowed down to stay fair.
//
// The warp's rift. The EXIT is the whole contract: it opens this long before
// the round arrives, and it opens where the round will come from - so a player
// who is reading the arena has a point in space to step away from, in exactly
// the way they would step off a line.
export const WARP_CD = 3.0;

export const WARP_RANGE = 26;

export const WARP_LEAD = 0.85;

// How far from the player the exit opens. Close enough to be a threat, far
// enough that the round is travelling when it reaches them rather than
// appearing on top of them - a rift that opened at zero range would be a
// hitscan with extra steps.
export const WARP_EXIT_R = 5.5;

// The monolith walks through everything, so it is slowed and telegraphed by
// its own size instead. Nothing else in the roster ignores the nav grid.
export const MONO_SWING_RANGE = 4.2;

// The singularity's well. It does NO damage - the whole payload is the two
// seconds the player spends being dragged back to a spot they were leaving.
export const SING_CD = 5.0;

export const SING_RANGE = 24;

export const SING_WELL_LIFE = 2.2;

export const SING_WELL_R = 7.0;

// Well under pullPlayer's own cap of 5.5. It has to be a drag the player can
// still walk against - a well that simply moved them would be a stun, and a
// stun with no telegraph is the worst thing this game could do.
export const SING_PULL = 2.4;

export const _voidAt = new THREE.Vector3();

// THE HEX. Two seconds of channel for ten of curse, and a range the channel
// breaks at. Breaking it by RANGE rather than by damage is what keeps the
// enemy meaningful: a channel any stray pellet cancelled would never once
// finish, and the player would never learn what a hexer is for.
export const HEX_CHANNEL = 2.0;

export const HEX_RANGE = 24;

export const HEX_BREAK = 28;

export const HEX_CURSE = 10;

export const HEX_CD = 9;

// Legless and hovering, a narrow spike with a ragged hem. Read: it is not
// walking anywhere, and it will be behind you.
export function buildWraith(e, g, s) {
  const P = partsFor(e, g, s);
  P('wraithCore', shard(0.21), { y: 0.98 });
  P('wraithSpike', spike(0.11, 0.6, 4), { y: 1.5 });
  // A loose open shroud rather than a hard body: it should read as something
  // only partly there, so a blink looks like the trick it was already doing.
  const shroud = new THREE.Mesh(
    geo('wraithShroud', () => new THREE.ConeGeometry(0.44, 1.15, 6, 1, true)),
    SHARED_MATS.wraithShroud
  );
  shroud.position.y = 0.72 * s;
  shroud.scale.setScalar(s);
  g.add(shroud);
  // The hem, torn into three points. This is what says it has no feet.
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    P('wraithTatter', spike(0.1, 0.42, 4), {
      x: Math.cos(a) * 0.26, y: 0.26, z: Math.sin(a) * 0.26, rx: Math.PI,
    });
  }
  P('wraithBlade', spike(0.07, 0.55, 4), { x: 0.24, y: 1.0, z: -0.4, rx: -Math.PI / 2 });
  eyes(P, { y: 1.05, x: 0.09, z: -0.19, r: 0.85, mat: e.eyeMat });
}

// Squat and wide, with a BUCKLER over the chest rather than a wall across the
// whole front. The read the model has to deliver is the opposite of the old
// one: not "the front is closed, go around", but "that plate is closed, shoot
// literally anywhere else". So the plate is small, bright and unmistakably a
// separate object - a different material, a raised boss, and a visible arm
// holding it off the body - while the head, the shoulders and the legs are all
// left standing clear of it in silhouette. Anything the buckler does not cover
// takes full damage, and the player has to be able to see that at a glance.
// ---- VOID ------------------------------------------------------------------
// The theme's language: floating masses with no legs under them, held apart
// with gaps that do not close, and every one of them missing the part that
// would make it a body. Where STRATA is cut and RIME is faceted, VOID is
// INCOMPLETE - shapes the eye keeps trying to finish and cannot.
//
// The rule that makes it work is negative space in the MIDDLE. Every one of
// these has a hole through it where a torso would be, which is what stops
// three floating rocks reading as three floating rocks.

// A ring with an arm through it. The rift it fires into hangs where a chest
// would be, so the silhouette has its hole exactly where the eye looks first.
export function buildWarp(e, g, s) {
  const P = partsFor(e, g, s);
  // THE RING IS THE BODY. Six blades stood on edge around an empty middle,
  // tilted off vertical so it reads as a thing rather than as a hoop.
  const bladeGeo = shard(0.2);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    P('warpBlade', bladeGeo, {
      x: Math.cos(a) * 0.36, y: 1.16 + Math.sin(a) * 0.1, z: Math.sin(a) * 0.14,
      rz: -a, sz: 0.4,
    });
  }
  // The rift itself: a small bright shard suspended in the ring's middle,
  // which is where the round goes in.
  P('warpRift', shard(0.13), { y: 1.16, mat: e.eyeMat, shadow: false });
  // A single long arm reaching through the ring - the only limb, and what
  // makes the outline asymmetric enough to read as a gunner.
  P('warpArm', slab(0.09, 0.62, 0.09), { x: 0.3, y: 1.1, rz: -0.9, rx: -0.3 });
  P('warpHand', shard(0.13), { x: 0.52, y: 1.32 });
  // A head on a stalk above the ring, and NOTHING below it - no hips, no legs.
  P('warpNeck', slab(0.07, 0.3, 0.07), { y: 1.56 });
  P('warpHead', shard(0.17), { y: 1.78, sz: 0.65 });
  // A short tapered tail hanging under the ring, so it is clearly floating
  // rather than cropped off at the knees.
  P('warpTail', spike(0.12, 0.5, 4), { y: 0.72, rx: Math.PI });
  eyes(P, { y: 1.8, x: 0.08, z: -0.15, r: 0.75, mat: e.eyeMat });
}

// One enormous flat slab standing on nothing, with a rift split through the
// middle of it. Read: it is a wall, it is coming, and there is no way round.
export function buildMonolith(e, g, s) {
  const P = partsFor(e, g, s);
  // TWO HALVES WITH A GAP, not one slab. The gap is the whole silhouette -
  // a solid rectangle at this size reads as scenery, and the split reads as
  // something that has been broken open and did not close again.
  P('monoSlabL', slab(0.4, 1.9, 0.3), { x: -0.32, y: 1.1, rz: 0.05 });
  P('monoSlabR', slab(0.4, 1.9, 0.3), { x: 0.32, y: 1.1, rz: -0.05 });
  // The rift in the gap, tall and thin: the only bright thing, and it runs
  // most of the height so the split is unmissable from any distance.
  P('monoRift', slab(0.12, 1.3, 0.1), { y: 1.12, mat: e.eyeMat, shadow: false });
  // A heavy cap and a heavy foot bridging the halves, so they are one object.
  P('monoCap', slab(0.96, 0.24, 0.42), { y: 2.12, rz: 0.02 });
  P('monoBase', slab(0.86, 0.2, 0.38), { y: 0.2 });
  // NOTHING TOUCHES THE FLOOR. The base hangs a clear span above it, which is
  // what says this thing is not walking - it is being carried.
  P('monoDrift', shard(0.16), { x: -0.3, y: 0.02, sy: 0.5, shadow: false });
  P('monoDrift', shard(0.16), { x: 0.3, y: 0.02, sy: 0.5, shadow: false });
  // Two blades swept off the shoulders, angled forward - the only parts that
  // suggest a front, and what it swings.
  P('monoBlade', spike(0.12, 0.7, 4), { x: -0.56, y: 1.6, rz: 0.9, rx: -0.4 });
  P('monoBlade', spike(0.12, 0.7, 4), { x: 0.56, y: 1.6, rz: -0.9, rx: -0.4 });
  eyes(P, { y: 1.86, x: 0.16, z: -0.24, r: 1.1, mat: e.eyeMat });
}

// A cage around a hole. Bottom-heavy and hunched like the other ground-deniers
// (blight, kiln, geode), but with the mass arranged AROUND an empty centre
// rather than piled up - it is a thing that carries a well.
export function buildSingularity(e, g, s) {
  const P = partsFor(e, g, s);
  // The cage: four curved ribs meeting top and bottom, with nothing between
  // them. Wide at the waist, so the hole is the widest part of the outline.
  const ribGeo = slab(0.1, 0.86, 0.1);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    P('singRib', ribGeo, {
      x: Math.cos(a) * 0.42, y: 0.74, z: Math.sin(a) * 0.42,
      rz: Math.cos(a) * -0.5, rx: Math.sin(a) * 0.5,
    });
  }
  P('singCap', prism(0.16, 0.3, 0.2, 5), { y: 1.2 });
  P('singFoot', prism(0.3, 0.2, 0.2, 5), { y: 0.24 });
  // THE WELL, suspended in the cage. Small, dark-cored and bright-edged: it is
  // what gets thrown, and it should look like an absence rather than an object.
  P('singWell', shard(0.2), { y: 0.74, mat: e.eyeMat, shadow: false });
  // A head leaning out over the cage, so it has a front.
  P('singNeck', slab(0.08, 0.26, 0.08), { y: 1.4, z: -0.1, rx: -0.4 });
  P('singHead', shard(0.15), { y: 1.58, z: -0.22, sz: 0.7 });
  // Legless, with a stub of a tail - it floats like the rest of the theme.
  P('singTail', spike(0.13, 0.44, 4), { y: 0.1, rx: Math.PI });
  eyes(P, { y: 1.6, x: 0.08, z: -0.32, r: 0.75, mat: e.eyeMat });
}

// The other support shape, and deliberately the thinnest thing in the roster:
// a floating spine holding a ring up in front of itself. Where the conduit is
// a machine and the warden a monolith, this is a FIGURE - it has shoulders and
// a head, and it is pointing at you.
export function buildHexer(e, g, s) {
  const P = partsFor(e, g, s);
  P('hexerSpine', prism(0.1, 0.16, 0.9, 5), { y: 1.15 });
  P('hexerCowl', prism(0.26, 0.1, 0.3, 6), { y: 1.62, rx: 0.15 });
  P('hexerHead', shard(0.13), { y: 1.5, z: -0.06 });
  // The hem: a skirt of thin blades where legs would be, hanging clear of the
  // floor. Legless is the support read, and this is what fills the gap the
  // missing legs leave in the outline.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    P('hexerHem', spike(0.06, 0.44, 4), {
      x: Math.cos(a) * 0.2, y: 0.5, z: Math.sin(a) * 0.2, rx: Math.PI + Math.sin(a) * 0.2,
      rz: -Math.cos(a) * 0.2,
    });
  }
  // Two arms held out and forward, cradling the ring. They are what make the
  // thing read as aiming rather than as floating.
  P('hexerArm', slab(0.07, 0.34, 0.07), { x: -0.26, y: 1.24, z: -0.2, rx: -0.9, rz: -0.4 });
  P('hexerArm', slab(0.07, 0.34, 0.07), { x: 0.26, y: 1.24, z: -0.2, rx: -0.9, rz: 0.4 });
  // THE SIGIL. A ring standing upright in front of the chest, spun while it
  // channels - and the thing the beam appears to come out of.
  const ring = new THREE.Mesh(
    geo('hexerRing', () => new THREE.TorusGeometry(0.3, 0.045, 6, 12)),
    SHARED_MATS.hexerRing
  );
  ring.position.set(0, 1.2 * s, -0.42 * s);
  ring.scale.setScalar(s);
  e.ring = ring;
  g.add(ring);
  eyes(P, { y: 1.52, x: 0.07, z: -0.16, r: 0.85, mat: e.eyeMat });
}

// ---- the air roster ------------------------------------------------------
// One shape language, split down the middle. BOTH are legless with a lit
// underside, which is the shared read for "this is not on the floor" and is
// the only thing in the roster that glows downward. Everything else about them
// is opposed, because their behaviour is:
//
//   harrier  wide, flat, SYMMETRICAL, wings drooping - a platform. It holds
//            still and works at range, so it is built like something parked.
//   shrike   long, narrow, nose-forward, wings swept UP - a weapon. It is
//            longer than it is tall, which nothing else here is, and the
//            silhouette points at where it is going.
//
// The test is the same one the ground roster is held to: as a flat black
// shape, against the sky, you can tell which one is about to hit you.

// The widest thing in the game, on two thick legs, with a shuttered core in
// its chest.
// The third airframe, and the odd one out. Harrier and shrike are both hard -
// a plate and a spear - so this one is CLOTH: a narrow body under a wide,
// ragged veil, with no straight edge anywhere on it. Against the sky the other
// two are machines and this is a rag, which is the whole tell.
export function buildShade(e, g, s) {
  const P = partsFor(e, g, s);
  P('shadeBody', prism(0.1, 0.2, 0.56, 5), { y: 1.0, rx: -Math.PI / 2, sz: 0.8 });
  P('shadeHead', shard(0.15), { y: 1.02, z: -0.3, sz: 1.2 });
  // THE VEIL. Three panels a side, each a thin plate at its own angle, so the
  // outline is torn rather than swept. Transparent, and the only thing in the
  // air that is.
  for (const dir of [-1, 1]) {
    P('shadeVeil', slab(0.66, 0.03, 0.3), {
      x: dir * 0.4, y: 1.06, z: 0.02, rz: dir * 0.22, ry: dir * 0.3,
      mat: SHARED_MATS.shadeVeil, shadow: false,
    });
    P('shadeVeil', slab(0.44, 0.03, 0.22), {
      x: dir * 0.62, y: 0.96, z: 0.26, rz: dir * -0.35, ry: dir * 0.6,
      mat: SHARED_MATS.shadeVeil, shadow: false,
    });
    P('shadeTail', slab(0.1, 0.03, 0.5), {
      x: dir * 0.16, y: 0.9, z: 0.46, rx: dir * 0.12, ry: dir * 0.18,
      mat: SHARED_MATS.shadeVeil, shadow: false,
    });
  }
  // The lit underside every flier wears, so it is read as airborne from the
  // floor. A narrow strip, like the shrike's.
  P('shadeGlow', slab(0.1, 0.05, 0.44), {
    y: 0.86, mat: SHARED_MATS.harrierGlow, shadow: false,
  });
  eyes(P, { y: 1.04, x: 0.08, z: -0.36, r: 1.1, mat: e.eyeMat });
}

// A funnel: wide open at the top, narrowing to nothing at the floor. Nothing
// else in the game is wider at the top, and that is the whole read - it is a
// mouth, and it is pulling.
export function buildMaw(e, g, s) {
  const P = partsFor(e, g, s);
  P('mawFunnel', prism(0.78, 0.18, 1.05, 8), { y: 0.62 });
  P('mawStem', prism(0.18, 0.3, 0.2, 6), { y: 0.1 });
  // Teeth around the rim, pointing inward and down into the throat.
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    P('mawTooth', spike(0.09, 0.34, 4), {
      x: Math.cos(ang) * 0.66, y: 1.0, z: Math.sin(ang) * 0.66,
      rx: Math.PI - Math.sin(ang) * 0.4, rz: Math.cos(ang) * 0.4,
    });
  }
  P('mawVoid', shard(0.44), { y: 0.95, mat: SHARED_MATS.sniperScope, shadow: false });
  const maw = new THREE.Mesh(
    geo('mawRing', () => new THREE.TorusGeometry(0.8, 0.13, 8, 16)),
    SHARED_MATS.conduitRing
  );
  maw.rotation.x = Math.PI / 2;
  maw.position.y = 1.14 * s;
  maw.scale.setScalar(s);
  e.ringA = maw;
  g.add(maw);
}

// Blink flanker. It closes the way anything else does, but every few seconds
// it jumps to the space BEHIND the player, which is the whole point of the
// type - a player watching the crowd in front never sees it arrive.
// THE BLINK IS AN ANIMATION NOW, not a cut.
//
// It used to be one frame: a burst where the wraith was, a burst where it
// landed, and the model already standing there. Both halves were over inside
// a sixth of a second and neither of them read - the enemy was simply
// somewhere else, and a player who lost track of it learned nothing about why.
// Three things fix that, and all three are needed:
//
//   IT LEAVES. A wind-up it can be seen to start (WRAITH_WARP): the body
//   squashes down into its own footprint, spinning up as it goes, over a ring
//   on the floor. That is the frame the player has to notice.
//   IT TRAVELS. A beam is drawn from where it left to where it lands for the
//   whole arrival, so the two ends are one move rather than two events.
//   IT ARRIVES. It unfolds back to full size (WRAITH_FORM) instead of popping
//   in - a body growing out of the floor behind you is visible in peripheral
//   vision in a way an instant appearance is not.
//
// It is HELPLESS for the whole of both: no swing, no contact damage, and the
// arrival is deliberately the longer half, because that is the moment the
// player is meant to get a shot off if they read it.
export const WRAITH_WARP = 0.3;

export const WRAITH_FORM = 0.34;

// How flat it is squashed at the end of the wind-up, and how small it starts
// on arrival. Not zero: a model scaled to nothing is a model that vanished,
// which is the thing being fixed.
export const WRAITH_MIN_SCALE = 0.12;

// Squash and spin, shared by both halves. `k` runs 1 (whole) to 0 (gone).
export function _wraithForm(e, k) {
  const base = e.blinkScale;
  const w = WRAITH_MIN_SCALE + (1 - WRAITH_MIN_SCALE) * k;
  // Widening as it flattens: a body collapsing into a disc, rather than one
  // shrinking evenly, which just reads as walking away from the camera.
  e.group.scale.set(base * (2 - w) * 0.85, base * w, base * (2 - w) * 0.85);
  // Tipped over as it collapses, so the squash has a direction to it. It goes
  // on rotation.x DELIBERATELY: update() overwrites rotation.y with the facing
  // yaw every frame and writes rotation.z for the dance, and x is the one axis
  // nothing else in this file touches - see the note on rotation.order.
  e.group.rotation.x = (1 - k) * 1.3 * e.blinkSpin;
}

export function _wraithEnd(e) {
  e.blinkState = '';
  e.blinkT = 0;
  e.group.scale.setScalar(e.blinkScale);
  e.group.rotation.x = 0;
  e._setEyeAlert(false);
}

export function aiWraith(e, a) {
  const ctx = a.ctx;
  // The base scale is read the first time it is needed rather than at
  // construction: a wraith is never resized today, but _splitInto is proof
  // that group.scale is not always 1 and this must not fight whoever set it.
  if (e.blinkScale === undefined) e.blinkScale = e.group.scale.x || 1;

  // ---- leaving. Rooted, and not attacking: the melee cycle is skipped
  // entirely, so a wraith cannot swing out of a blink it has committed to.
  if (e.blinkState === 'warp') {
    e.blinkT -= a.dt;
    e._setEyeAlert(true);
    _wraithForm(e, Math.max(0, e.blinkT / WRAITH_WARP));
    if (e.blinkT > 0) return;
    _blinkAt.set(e.pos.x, 0.9, e.pos.z);
    ctx.effects.burst(_blinkAt, ENEMY_TYPES.wraith.eye, 18, 6, 2.5, 0.45);
    _blinkAt.set(e.pos.x, 0.05, e.pos.z);
    ctx.effects.shockwave(_blinkAt, ENEMY_TYPES.wraith.color, 2.2, 0.35);
    // Where it left from, kept for the beam that draws the move.
    e.blinkFromX = e.pos.x;
    e.blinkFromZ = e.pos.z;
    e.pos.x = e.blinkToX;
    e.pos.z = e.blinkToZ;
    resolveCircle(e.pos, e.radius, ctx.obstacles, e.collideH);
    e.blinkState = 'form';
    e.blinkT = WRAITH_FORM;
    _blinkAt.set(e.pos.x, 0.9, e.pos.z);
    ctx.effects.burst(_blinkAt, ENEMY_TYPES.wraith.eye, 22, 6, 2.5, 0.5);
    _blinkAt.set(e.pos.x, 0.05, e.pos.z);
    ctx.effects.shockwave(_blinkAt, ENEMY_TYPES.wraith.color, 2.6, 0.4);
    return;
  }

  // ---- arriving. Unfolds, still helpless, with the line of the move drawn
  // behind it - redrawn every frame, because beams last exactly one.
  if (e.blinkState === 'form') {
    e.blinkT -= a.dt;
    const k = 1 - Math.max(0, e.blinkT / WRAITH_FORM);
    _wraithForm(e, k);
    _blinkFrom.set(e.blinkFromX, 0, e.blinkFromZ);
    _blinkAt.set(e.pos.x, 0, e.pos.z);
    ctx.effects.beam(_blinkFrom, _blinkAt, ENEMY_TYPES.wraith.eye);
    if (e.blinkT <= 0) _wraithEnd(e);
    return;
  }

  aiMelee(e, a);
  e.blinkCd -= a.dt;
  // Only from the middle distance. Blinking while already in melee would just
  // teleport it out of its own swing, and from across the arena it reads as
  // the enemy cheating rather than flanking.
  if (e.blinkCd > 0 || a.dist < 6 || a.dist > 20) return;
  // Nor out of a swing it has already started - the same rule the bosses hold.
  if (e.windup > 0 || e.swing > 0) return;
  e.blinkCd = 2.6 + Math.random() * 1.4;

  const p = ctx.player;
  const f = p.forwardInto(_blinkFwd);
  // Behind the player first; if that lands in a wall or a crate, in front of
  // them instead, which still puts it somewhere they were not looking at.
  let tx = p.pos.x - f.x * 2.5;
  let tz = p.pos.z - f.z * 2.5;
  _blinkAt.set(tx, 0.5, tz);
  const B = 21.6 - (e.radius - 0.5);
  if (Math.abs(tx) > B || Math.abs(tz) > B || pointInObstacle(_blinkAt, ctx.obstacles)) {
    tx = p.pos.x + f.x * 3;
    tz = p.pos.z + f.z * 3;
    _blinkAt.set(tx, 0.5, tz);
    if (Math.abs(tx) > B || Math.abs(tz) > B || pointInObstacle(_blinkAt, ctx.obstacles)) return;
  }

  // The destination is fixed HERE, at the start of the wind-up, and not
  // recomputed when the warp ends: the player gets the length of the wind-up
  // to move away from where it is going, which is the counter-play the instant
  // version never had.
  e.blinkToX = tx;
  e.blinkToZ = tz;
  e.blinkSpin = Math.random() < 0.5 ? -1 : 1;
  e.blinkState = 'warp';
  e.blinkT = WRAITH_WARP;
  e.windup = 0;
  e.swing = 0;
  _blinkAt.set(e.pos.x, 0.05, e.pos.z);
  ctx.effects.shockwave(_blinkAt, ENEMY_TYPES.wraith.eye, 1.8, 0.3);
}

// No attack of its own - it keeps its distance and makes everything near it
// harder to kill. The links are not decoration: they are the only way the
// player can tell which enemies are being buffed and therefore why the crowd
// suddenly stopped dying.
// ---- STRATA ----------------------------------------------------------------

// Opens a rift near the player, waits, and fires the round out of IT rather
// than out of itself. There is never a line between the warp and the player,
// so there is nothing for cover to interrupt - what the player reads is the
// exit, and what they do about it is step off the point.
export function aiWarp(e, a) {
  orbit(e, a, ENEMY_TYPES.warp.orbit);
  const p = a.ctx.player;
  if (!p) return;

  if (e.riftT > 0) {
    e.riftT -= a.dt;
    // The exit hangs in the air, marked, for the whole lead. It is the only
    // warning the round gets and it must never be skipped.
    if (a.ctx.effects) {
      _voidAt.set(e.riftX, 1.2, e.riftZ);
      a.ctx.effects.burst(_voidAt, 0x8b7bff, 2, 1.2, 0, 0.35);
      // A line from the caster to its own exit, so a player who has not yet
      // learned the enemy can see WHO opened the hole they are standing next
      // to. Every VOID mechanic is invisible without this.
      a.ctx.effects.beam(e.pos, _voidAt, 0x6f5bff);
    }
    if (e.riftT <= 0) {
      // Fired FROM the exit, aimed at the player from there.
      a.ctx.addProjectile(e.riftX, 1.2, e.riftZ, 'warp', e._projScale());
      if (a.ctx.effects) {
        _voidAt.set(e.riftX, 1.2, e.riftZ);
        a.ctx.effects.burst(_voidAt, 0xd0c4ff, 14, 4, 2, 0.45);
      }
      e._setEyeAlert(false);
    }
    return;
  }

  if (e.attackCd > 0 || a.dist > WARP_RANGE) return;
  e.attackCd = WARP_CD + Math.random() * 0.8;
  e.flash = 0.14;
  e._setEyeAlert(true);
  // The exit opens on a random bearing around the player rather than between
  // them and the warp - which is the point: it can come from behind, and no
  // amount of facing the enemy prevents it.
  const ang = Math.random() * Math.PI * 2;
  e.riftX = Math.max(-20, Math.min(20, p.pos.x + Math.cos(ang) * WARP_EXIT_R));
  e.riftZ = Math.max(-20, Math.min(20, p.pos.z + Math.sin(ang) * WARP_EXIT_R));
  e.riftT = WARP_LEAD;
}

// Walks THROUGH the arena in a dead straight line. The only enemy in the game
// that ignores the navigation grid entirely - and it has to be written as a
// deliberate override rather than as a missing call, because every other
// ground type steers by `px, pz` and a reader will assume this one does too.
export function aiMonolith(e, a) {
  // THE STRAIGHT LINE, not the path. `nx, nz` is the bearing to the player;
  // `px, pz` is the route around cover, and this type never reads it.
  const sp = e._effSpeed();
  a.vx = a.nx * sp;
  a.vz = a.nz * sp;
  // Passing through obstacles is a property of the COLLISION resolver, not of
  // the steering - see Enemy.update, where a type with `phase` is not pushed
  // back out of what it is inside.
  e.phase = true;
  if (a.dist < MONO_SWING_RANGE) {
    // Close enough to swing. aiMelee writes its own velocity, so it runs
    // instead of the straight line rather than as well as it.
    aiMelee(e, a);
  }
}

// Lobs a well. It does no damage; what it does is take back the two seconds
// the player spent getting out of somewhere.
export function aiSingularity(e, a) {
  orbit(e, a, ENEMY_TYPES.singularity.orbit);
  if (e.attackCd > 0 || a.dist > SING_RANGE) return;
  e.attackCd = SING_CD + Math.random() * 1.2;
  e.flash = 0.15;
  a.ctx.addSpit(e.pos.x + a.nx * 0.8, 1.3, e.pos.z + a.nz * 0.8, 'well');
  if (a.ctx.effects) {
    _voidAt.set(e.pos.x, 1.4, e.pos.z);
    a.ctx.effects.burst(_voidAt, 0x7c4dff, 10, 3, 2, 0.5);
  }
}

// THE HEX. It stands off and spends two seconds pointing at you.
//
// The beam is redrawn every frame from its head to the player's eye, which
// makes it the only permanent line in a fight and therefore the easiest thing
// on screen to trace back to its owner. That is the design: the player is not
// supposed to work out what cursed them, they are supposed to see it happening
// and get a decision - kill it, or break the range, or accept ten seconds of
// taking a quarter more from everything.
export function aiHexer(e, a) {
  const ctx = a.ctx;
  orbit(e, a, ENEMY_TYPES.hexer.orbit);
  e.xT = (e.xT || 0) - a.dt;

  if (e.xState !== 'channel') {
    if (e.xT > 0 || a.dist > HEX_RANGE) return;
    e.xState = 'channel';
    e.xT = HEX_CHANNEL;
    e._setEyeAlert(true);
    return;
  }

  // Channelling. It keeps its distance but stops strafing hard - a caster
  // sliding sideways at full speed makes the beam impossible to follow back.
  a.vx *= 0.35;
  a.vz *= 0.35;
  if (e.ring) e.ring.rotation.z += a.dt * 3.2;
  if (ctx.effects) {
    // BOTH ENDS ARE PASSED LOW ON PURPOSE. effects.beam adds 0.9 to whatever y
    // it is given - it was written for conduit-to-enemy links between two
    // things standing on the floor - so a beam handed the player's EYE is
    // drawn at 2.6m, which from a first-person camera is behind and above the
    // viewer and therefore invisible. The far end goes to the player's CHEST,
    // half a metre under the eye: the beam then arrives just below the
    // crosshair, where it can actually be seen coming.
    // DRAWN TWICE, a hand's width apart. A GL line is one pixel wide however
    // thick it is asked to be - the same problem the lightning bolts solve
    // with three jittered forks - and one hairline across a dark arena is not
    // a thing anyone notices while being shot at. Two is enough here because
    // this line is two seconds long rather than a fifth of one, and the beam
    // pool is only eight deep and shared with every conduit link on the floor.
    const t = ctx.time * 2.2 + e.id;
    for (const off of [-0.09, 0.09]) {
      _hexFrom.set(e.pos.x + off, 0.35 + Math.sin(t) * 0.03, e.pos.z);
      _hexTo.set(
        ctx.player.pos.x + off * 0.5, ctx.player.pos.y + 0.2, ctx.player.pos.z
      );
      ctx.effects.beam(_hexFrom, _hexTo, ENEMY_TYPES.hexer.color);
    }
  }

  // Broken by RANGE, and only by range. A channel any stray pellet cancelled
  // would never finish once in a run, and an enemy whose whole mechanic never
  // resolves teaches the player nothing except to ignore it.
  if (a.dist > HEX_BREAK) {
    e.xState = 'idle';
    e.xT = HEX_CD * 0.5;
    e._setEyeAlert(false);
    return;
  }
  if (e.xT > 0) return;

  e.xState = 'idle';
  e.xT = HEX_CD;
  e._setEyeAlert(false);
  if (ctx.applyPlayerStatus) ctx.applyPlayerStatus('curse', HEX_CURSE);
  if (ctx.effects) {
    ctx.effects.shockwave(ctx.player.pos, ENEMY_TYPES.hexer.color, 3.2, 0.4);
    _blinkAt.set(e.pos.x, 1.4, e.pos.z);
    ctx.effects.burst(_blinkAt, ENEMY_TYPES.hexer.eye, 18, 5, 2, 0.6);
  }
}

// MAW. Two pressures at once: a constant drag inward, and rings rolling out
// along the floor that have to be jumped. Neither is survivable by standing
// still, which is the whole design.
export const MAW_RING_CAP = 40;

export const MAW_TOUCH_CAP = 30;

export function aiMaw(e, a) {
  const bs = e.bs;
  if (!bs.rings) {
    bs.rings = [];
    bs.ringCd = 2;
    bs.touchCd = 0;
    bs.mark = -1;
  }
  bs.fx = a.ctx.effects;

  e.ringA.rotation.z += a.dt * 2.2;

  // The drag, every frame, falling off with distance. Capped in main.js well
  // under the player's own speed: running out has to stay possible.
  if (a.dist < 22 && e.status.fear <= 0) {
    a.ctx.pullPlayer(-a.nx, -a.nz, 4.2 * (1 - a.dist / 22) * (e.damage / 26));
  }

  // Rings roll outward and damage anyone standing on the ground as they pass.
  for (let i = bs.rings.length - 1; i >= 0; i--) {
    const r = bs.rings[i];
    r.r += 9 * a.dt;
    r.life -= a.dt;
    // Low fill so it reads as a travelling RING rather than a filled disc -
    // the edge is the part that hurts.
    a.ctx.effects.markSet(r.mark, e.pos.x, e.pos.z, r.r, 0x7c4dff, 0.15);
    const pd = Math.hypot(a.ctx.player.pos.x - e.pos.x, a.ctx.player.pos.z - e.pos.z);
    // Only catches a player on the ground: the jump gives about 0.8s of air
    // against a ring moving 9 m/s, which clears it comfortably if it is timed.
    if (!r.hit && Math.abs(pd - r.r) < 0.7 && a.ctx.player.pos.y < 0.6) {
      r.hit = true;
      a.ctx.onHitPlayer(Math.min(MAW_RING_CAP, e.damage * 1.54), a.ctx.player.pos, e);
    }
    if (r.life <= 0 || r.r > 24) {
      a.ctx.effects.markRelease(r.mark);
      bs.rings.splice(i, 1);
    }
  }

  bs.ringCd -= a.dt;
  if (bs.ringCd <= 0 && bs.rings.length < 3 && e.status.fear <= 0) {
    bs.ringCd = 3.2 * e.rate;
    const mk = a.ctx.effects.markAcquire();
    if (mk >= 0) bs.rings.push({ r: 1.5, life: 2.6, hit: false, mark: mk });
    _bossAt.set(e.pos.x, 0, e.pos.z);
    a.ctx.effects.burst(_bossAt, 0x7c4dff, 18, 4, 1.5, 0.6);
  }

  // Slow, and it barely chases - the pull is what closes the distance. Touch
  // damage exists only so it cannot be hugged while the rings pass overhead.
  bs.touchCd -= a.dt;
  if (a.dist < 4 && _reachY(a) < BOSS_REACH_Y && bs.touchCd <= 0) {
    bs.touchCd = 1.4 * e.rate;
    a.ctx.onHitPlayer(Math.min(MAW_TOUCH_CAP, e.damage * 0.77), e.pos, e);
    a.ctx.effects.addShake(0.15);
  }
  if (e.status.fear > 0) return;
  a.vx = a.px * a.sp;
  a.vz = a.pz * a.sp;
}

const TYPES = {
  // ---- the second roster -------------------------------------------------
  // Four types that ask for something the original six never did: watch your
  // back, get around it, shoot the right one first, and move.

  // Punishes tunnel vision. Fragile and fast, and it does not approach in a
  // straight line - it blinks past you and swings from behind, so a player
  // who has locked onto the crowd in front loses health to something they
  // never saw. Cheap in HP because it is meant to die the moment it is noticed.
  wraith: {
    hp: 26, speed: 4.2, damage: 11, value: 190, color: 0x6f5bff, eye: 0xd0c4ff,
    scale: 0.95, radius: 0.45, mass: 1,
    melee: { windup: 0.35, start: 1.4, hit: 2.0, cd: 0.9 },
    build: buildWraith, ai: aiWraith,
  },

  // ---- the rest of VOID ---------------------------------------------------
  //
  // The theme that takes SPACE away. Nothing here hurts you the ordinary way -
  // a warp round does modest damage, a singularity does none at all, and a
  // monolith is too slow to catch anybody. What they take instead is the three
  // things a player uses space for: the cover they are behind, the ground they
  // meant to stand on, and the distance they were keeping.
  //
  // SO IT IS THE ONLY THEME THAT CANNOT BE ANSWERED BY POSITIONING, which is
  // the answer to every other theme in the game. EMBER is answered by moving
  // off the fire, RIME by leaving the field, STRATA by getting out of the
  // corner. Against VOID the position you were about to take is the thing it
  // has already taken.
  //
  // THE SHARED SILHOUETTE IS THE UNFINISHED EDGE. Floating masses with no legs
  // under them, held apart with gaps that do not close, and every one of them
  // missing the part that would make it a body. Where STRATA is cut and RIME
  // is faceted, VOID is INCOMPLETE - shapes the eye keeps trying to finish.

  // Fires into a rift and the round comes out of a second one somewhere else.
  // COVER DOES NOT WORK: there is no line between a warp and the player for a
  // pillar to interrupt, because the round does not travel along it.
  //
  // What answers it instead is the EXIT, which opens a beat before the round
  // arrives and hangs in the air where it is going to come from. So the enemy
  // is not unfair, it is a different question - the player is reading a point
  // in space rather than a line, and stepping off the point.
  warp: {
    hp: 27, speed: 2.5, damage: 8, value: 250, color: 0x8b7bff, eye: 0xd0c4ff,
    scale: 1.0, radius: 0.46, mass: 1,
    orbit: { dist: 12, band: 2.5, out: 0.8, in: -0.7, strafe: 0.5, flip: 1.8, flipVar: 2 },
    proj: {
      core: 0xd0c4ff, glow: 0x6f5bff, scale: 0.7,
      speed: [15, 0.3, 24], dmg: [8, 0.5, 18],
    },
    build: buildWarp, ai: aiWarp,
  },

  // A slab that walks THROUGH the arena. It does not path around cover and it
  // does not climb - it passes through pillars, crates and decks as though
  // they were not there, in a dead straight line, forever.
  //
  // Which makes it the one enemy in the game that cannot be broken line of
  // sight with. Everything else in the roster is answerable by putting
  // something solid between you and it; the monolith is answerable only by
  // distance and by killing it, and it is slow enough that both are genuinely
  // available. What it costs is the corner you were going to hide in.
  //
  // Immovable. A slab this size being shoved by a shockwave would be the
  // silliest thing in the game.
  monolith: {
    hp: 175, speed: 1.45, damage: 22, value: 350, color: 0x5a4fd0, eye: 0xd0c4ff,
    scale: 1.5, radius: 0.62, mass: 5,
    melee: { windup: 0.9, start: 3.0, hit: 3.6, cd: 2.6 },
    build: buildMonolith, ai: aiMonolith,
  },

  // Lobs a well that PULLS. It does no damage at all - it drags the player in
  // toward the point where it landed and holds them there for a couple of
  // seconds, and everything else in the room does the rest.
  //
  // The purest expression of the theme: a singularity on its own is completely
  // harmless, and a singularity next to a monolith is the reason the monolith
  // catches somebody. It is the enemy that makes the wave's other enemies
  // work, which is the artillery role's job done in the only currency VOID
  // spends.
  singularity: {
    hp: 42, speed: 1.85, damage: 0, value: 290, color: 0x7c4dff, eye: 0xd0c4ff,
    scale: 1.1, radius: 0.54, mass: 1,
    orbit: { dist: 14, band: 2.5, out: 0.7, in: -0.5, strafe: 0.3, flip: 2.5, flipVar: 2 },
    proj: { core: 0xd0c4ff, glow: 0x7c4dff, scale: 1.3 },
    build: buildSingularity, ai: aiSingularity,
  },

  // Makes everything else hurt more. It stands further back than anything but
  // a sniper and channels, holding a beam on the player for two full seconds;
  // if it finishes, the player takes 25% more from every source for ten.
  //
  // The beam is not decoration - it is the target designation. This is the one
  // enemy in the roster whose correct answer is always "that one, now", and
  // the tether is what says so, drawn from it to you and impossible to lose in
  // a crowd. Kill it, or break the range, and the channel is wasted.
  hexer: {
    hp: 58, speed: 2.2, damage: 0, value: 380, color: 0xff2d6f, eye: 0xffd6e4,
    scale: 1.15, radius: 0.5, mass: 1,
    orbit: { dist: 14, band: 2.5, out: 0.8, in: -0.6, strafe: 0.3, flip: 2.2, flipVar: 2 },
    build: buildHexer, ai: aiHexer,
  },

  // The third flier, and the only one that is not trying to kill you. It flies
  // a shrike's loop - circle, wind up, dive, climb - and its dive hits for six
  // points and takes your trigger for two and a half seconds.
  //
  // What makes it dangerous is what is in the sky WITH it. Feared under an
  // empty ceiling is two seconds of walking; feared with a shrike already
  // winding up is the shrike's hit. It is priced as the cheapest flier in the
  // roster because on its own it barely does anything, which is exactly the
  // enemy it is meant to be.
  shade: {
    hp: 46, speed: 4.6, damage: 6, value: 320, color: 0xb06bff, eye: 0xf0d6ff,
    scale: 1.1, radius: 0.45, mass: 1,
    hitbox: { r: 0.55, y: 1.0 },
    fly: { height: 5.0 },
    orbit: { dist: 8, band: 2, out: 0.7, in: -0.7, strafe: 0.8, flip: 1.4, flipVar: 1.2 },
    hitStatus: { kind: 'fear', dur: 2.5 },
    build: buildShade, ai: aiShrike,
  },

  // A gravity well that will not let the player leave. It drags them in
  // continuously and rolls rings outward along the floor that have to be
  // JUMPED - the one boss that asks for a control the game has barely used.
  maw: {
    hp: 3300, speed: 1.2, damage: 26, value: 7000, color: 0x311b92, eye: 0x7c4dff,
    scale: 3.0, radius: 1.8, mass: 10, boss: true,
    hitbox: { r: 0.75, y: 0.8 },
    statusMul: 0.3, freezeSlow: true, slowFactor: 0.75, freezeVuln: 1.0,
    entropyExempt: true, fearMode: 'stagger',
    build: buildMaw, ai: aiMaw,
    cleanup: releaseMarks,
  },
};

Object.assign(ENEMY_TYPES, TYPES);
