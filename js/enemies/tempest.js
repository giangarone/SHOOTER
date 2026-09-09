// TEMPEST's six enemies and its boss.
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
  ENEMY_TYPES, aiMelee, eyes, landHit, orbit, partsFor, prism, segBlocked,
  shard, slab, spike,
} from './shared.js';

// A tuning fork that runs. Small, light, and almost all of its outline is the
// two prongs - so a pair of arclings across a room read as two forks aimed at
// each other before the wire between them is even drawn.
export function buildArcling(e, g, s) {
  const P = partsFor(e, g, s);
  // THE PRONGS ARE THE ENEMY. Tall, thin, and splayed - they clear the head
  // by half a body height, which is what makes the silhouette top-heavy and
  // unmistakable at a distance.
  P('arcProng', slab(0.07, 0.7, 0.07), { x: -0.19, y: 1.42, rz: 0.16 });
  P('arcProng', slab(0.07, 0.7, 0.07), { x: 0.19, y: 1.42, rz: -0.16 });
  // The core, suspended between their tips. The one bright thing on it.
  P('arcCore', shard(0.11), { y: 1.66, mat: e.eyeMat, shadow: false });
  // A narrow hunched body under them, deliberately small - a rusher this fast
  // should read as almost nothing but the fork it is carrying.
  P('arcTorso', prism(0.19, 0.11, 0.5, 4), { y: 0.92, rx: -0.24, ry: Math.PI / 4 });
  P('arcYoke', slab(0.42, 0.08, 0.09), { y: 1.14 });
  // Thin rods for legs. Nothing about this enemy is heavy.
  P('arcLeg', slab(0.06, 0.5, 0.06), { x: -0.13, y: 0.26, rz: 0.1 });
  P('arcLeg', slab(0.06, 0.5, 0.06), { x: 0.13, y: 0.26, rz: -0.1 });
  eyes(P, { y: 1.06, x: 0.09, z: -0.2, r: 0.7, mat: e.eyeMat });
}

// A wide V on a pole. The horns are held out in FRONT rather than up, so the
// gap between them faces the player - which is where the bolt charges, and so
// the tell is aimed at the person it is aimed at.
export function buildCoil(e, g, s) {
  const P = partsFor(e, g, s);
  // The two horns, swept forward and apart. Long enough that the V is legible
  // side-on as well as head-on.
  P('coilHorn', spike(0.09, 0.66, 4), { x: -0.26, y: 1.3, z: -0.22, rx: -1.25, rz: 0.4 });
  P('coilHorn', spike(0.09, 0.66, 4), { x: 0.26, y: 1.3, z: -0.22, rx: -1.25, rz: -0.4 });
  // THE BOLT, in the mouth of the V. Driven by aiCoil - it swells while the
  // shot is charging, which is the entire warning the player gets.
  e.coilCore = P('coilCore', shard(0.13), {
    y: 1.32, z: -0.5, mat: e.eyeMat, shadow: false,
  });
  // A thin column, and a collar where the horns are rooted. No shoulders and
  // no arms: everything this enemy does happens in front of its face.
  P('coilCollar', prism(0.19, 0.15, 0.16, 6), { y: 1.16 });
  P('coilSpine', slab(0.13, 0.72, 0.13), { y: 0.76 });
  P('coilFoot', prism(0.26, 0.3, 0.18, 6), { y: 0.16 });
  // A low outrigger each side, so it stands rather than balances.
  P('coilStrut', slab(0.05, 0.44, 0.05), { x: -0.19, y: 0.3, rz: 0.5 });
  P('coilStrut', slab(0.05, 0.44, 0.05), { x: 0.19, y: 0.3, rz: -0.5 });
  eyes(P, { y: 1.16, x: 0.1, z: -0.18, r: 0.75, mat: e.eyeMat });
}

// A standing barbell. Two heavy drum plates held apart at chest height on a
// squat frame, with the charge building in the gap - so the meter the player
// is filling is a thing on the model rather than a number nobody can see.
export function buildDynamo(e, g, s) {
  const P = partsFor(e, g, s);
  // THE DRUMS ARE HELD CLEAR OF EVERYTHING, and that is not a style choice.
  // The first draft had them at 0.36 either side of a torso 0.36 wide, so the
  // body filled the gap exactly and the silhouette came out as one solid
  // blob - the same failure the bellows had, where the central mass bridged
  // the space the whole design is built on. Pushed out past the body, and the
  // only thing crossing between them is the axle.
  const drum = prism(0.34, 0.34, 0.14, 6);
  P('dynDrum', drum, { x: -0.54, y: 0.98, rz: Math.PI / 2 });
  P('dynDrum', drum, { x: 0.54, y: 0.98, rz: Math.PI / 2 });
  // THE STORED CHARGE. Held on the enemy and grown by aiDynamo as the meter
  // fills, so a dynamo about to go off is visibly about to go off.
  e.dynCore = P('dynCore', shard(0.19), { y: 0.98, mat: e.eyeMat, shadow: false });
  P('dynAxle', slab(1.12, 0.07, 0.07), { y: 0.98 });
  // AND NO HEAD. The gap has to stay empty from the axle to the top of the
  // drums, and a head on a neck is exactly the wrong height to put anything
  // there - so this one is a device rather than an animal, which is what the
  // capacitor already is and what the theme reads as anyway.
  P('dynTorso', prism(0.24, 0.32, 0.56, 6), { y: 0.48 });
  P('dynCowl', slab(0.28, 0.2, 0.22), { y: 0.66, z: -0.16, rx: -0.3 });
  // Short thick legs, set wide. A brute that looked like it could run would
  // be lying, and this one has to look like it is BRACED.
  P('dynLeg', slab(0.2, 0.34, 0.22), { x: -0.26, y: 0.17 });
  P('dynLeg', slab(0.2, 0.34, 0.22), { x: 0.26, y: 0.17 });
  // Two stub arms, LOW and forward, for the swing it still has - below the
  // drums rather than beside them, or they would fill the gap from the side.
  P('dynArm', slab(0.11, 0.11, 0.36), { x: -0.36, y: 0.5, z: -0.2 });
  P('dynArm', slab(0.11, 0.11, 0.36), { x: 0.36, y: 0.5, z: -0.2 });
  eyes(P, { y: 0.68, x: 0.1, z: -0.28, r: 0.8, mat: e.eyeMat });
}

// Something carrying a mast. One long rod raised over the shoulder with a
// bright tip, and a body leaning back under the weight of it - so the outline
// says "this is pointed at the sky" from anywhere in the room.
export function buildStormcaller(e, g, s) {
  const P = partsFor(e, g, s);
  // THE MAST. It has to break the top of the silhouette by a long way or the
  // enemy is a blight with different colours.
  P('stormMast', slab(0.07, 1.35, 0.07), { x: 0.22, y: 1.5, rz: -0.2 });
  e.stormTip = P('stormTip', shard(0.14), {
    x: 0.44, y: 2.12, mat: e.eyeMat, shadow: false,
  });
  // Two short catch-prongs at the mast's foot, so the top of it is a fork like
  // everything else in the theme rather than a plain stick.
  P('stormFork', slab(0.05, 0.3, 0.05), { x: 0.31, y: 1.9, rz: -0.5 });
  P('stormFork', slab(0.05, 0.3, 0.05), { x: 0.5, y: 1.9, rz: 0.3 });
  // Leaning back, and asymmetric - one shoulder is carrying everything.
  P('stormTorso', prism(0.24, 0.3, 0.6, 5), { y: 0.86, rx: 0.22 });
  P('stormPauldron', prism(0.16, 0.2, 0.16, 5), { x: 0.28, y: 1.16, rz: -0.4 });
  P('stormHead', slab(0.22, 0.2, 0.2), { y: 1.28, z: -0.1, rx: 0.2 });
  P('stormArm', slab(0.09, 0.09, 0.4), { x: 0.26, y: 1.02, z: -0.1, rx: 0.5 });
  P('stormLeg', slab(0.11, 0.5, 0.13), { x: -0.16, y: 0.26 });
  P('stormLeg', slab(0.11, 0.5, 0.13), { x: 0.16, y: 0.26 });
  eyes(P, { y: 1.3, x: 0.09, z: -0.22, r: 0.75, mat: e.eyeMat });
}

// A stack of plates on a stalk, with a core in every gap. No head and no
// limbs at all - it is obviously a device rather than an animal, which is what
// a support has to read as before the player can be asked to shoot it first.
export function buildCapacitor(e, g, s) {
  const P = partsFor(e, g, s);
  const plate = prism(0.36, 0.36, 0.07, 6);
  // THREE PLATES, TWO GAPS. Three is the count that reads as a stack; two
  // would read as a drum and four as a column.
  P('capPlate', plate, { y: 0.66 });
  P('capPlate', plate, { y: 1.04 });
  P('capPlate', plate, { y: 1.42 });
  // The cores in the gaps, which is where the theme's language lives.
  e.capCoreA = P('capCore', shard(0.14), { y: 0.85, mat: e.eyeMat, shadow: false });
  e.capCoreB = P('capCore', shard(0.14), { y: 1.23, mat: e.eyeMat, shadow: false });
  // The stalk through them, and three thin legs. Nothing else.
  P('capStalk', slab(0.1, 1.3, 0.1), { y: 1.0 });
  for (let i = 0; i < 3; i++) {
    const ang = (i / 3) * Math.PI * 2 + 0.5;
    P('capLeg', slab(0.05, 0.6, 0.05), {
      x: Math.cos(ang) * 0.2, y: 0.3, z: Math.sin(ang) * 0.2,
      rz: Math.cos(ang) * -0.45, rx: Math.sin(ang) * 0.45,
    });
  }
  // A single eye on the top plate, and only one: a device that watches rather
  // than a face that looks.
  P('capEye', shard(0.08), { y: 1.52, mat: e.eyeMat, shadow: false });
}

// A pair of swept vanes with the middle taken out. Read from below - which is
// the only place it is ever seen from - it is a wide forward-raked V with a
// bright bar across the gap, and nothing that looks like a body.
export function buildSquall(e, g, s) {
  const P = partsFor(e, g, s);
  // THE VANES. Long, thin and swept back hard, and they carry the whole
  // outline: a squall has no attack, so it has to be recognisable in the two
  // seconds before it arrives or it is simply an unexplained shove.
  P('sqVane', slab(0.9, 0.06, 0.24), { x: -0.62, y: 0.6, z: 0.16, ry: 0.5, rz: 0.28 });
  P('sqVane', slab(0.9, 0.06, 0.24), { x: 0.62, y: 0.6, z: 0.16, ry: -0.5, rz: -0.28 });
  // Two short inner spars holding the vanes off a centre that is not there.
  P('sqSpar', slab(0.3, 0.07, 0.07), { x: -0.24, y: 0.6, rz: 0.2 });
  P('sqSpar', slab(0.3, 0.07, 0.07), { x: 0.24, y: 0.6, rz: -0.2 });
  // THE BAR ACROSS THE GAP, bright, and the only thing in the middle.
  P('sqCore', slab(0.26, 0.09, 0.09), { y: 0.6, mat: e.eyeMat, shadow: false });
  // A small forward prow so it has a direction, and a stub tail so it has a
  // back. Both deliberately tiny - the mass is all out on the vanes.
  P('sqProw', spike(0.11, 0.42, 4), { y: 0.6, z: -0.34, rx: -Math.PI / 2 });
  P('sqTail', spike(0.09, 0.3, 4), { y: 0.6, z: 0.3, rx: Math.PI / 2 });
  // A KEEL AND A FIN, and they are what make it an enemy rather than a smear.
  // Two swept vanes and nothing else is a horizontal line, and a horizontal
  // line seen from the floor at player eye height is a scratch on the screen -
  // it read as almost nothing in the viewer. The cross the fin and keel make
  // gives it height to be recognised by, and it is a different cross from the
  // mothcap's ragged disc and the sleet's hanging column.
  P('sqFin', slab(0.08, 0.44, 0.34), { y: 0.84, z: 0.1 });
  P('sqKeel', spike(0.15, 0.6, 4), { y: 0.32, z: -0.04, rx: Math.PI });
  eyes(P, { y: 0.62, x: 0.11, z: -0.22, r: 0.7, mat: e.eyeMat });
}

// A mast in the floor: two rails with bright rungs between them. Deliberately
// NOT an anchor - the Crown's anchor is a spike driven in, a lock on a door,
// and this is a thing with two ends and a line running out of the top of it.
export function buildPylon(e, g, s) {
  const P = partsFor(e, g, s);
  P('pylRail', slab(0.09, 1.7, 0.09), { x: -0.2, y: 0.9, rz: 0.05 });
  P('pylRail', slab(0.09, 1.7, 0.09), { x: 0.2, y: 0.9, rz: -0.05 });
  // The rungs. Bright, so the pylon is findable across a room at a glance -
  // which is the only thing it has to be.
  for (let i = 0; i < 3; i++) {
    P('pylRung', slab(0.34, 0.06, 0.06), {
      y: 0.5 + i * 0.42, mat: e.eyeMat, shadow: false,
    });
  }
  // A splayed foot, and a fork at the top where the boss's line lands.
  P('pylFoot', prism(0.24, 0.44, 0.2, 6), { y: 0.1 });
  P('pylFork', slab(0.06, 0.36, 0.06), { x: -0.17, y: 1.92, rz: 0.4 });
  P('pylFork', slab(0.06, 0.36, 0.06), { x: 0.17, y: 1.92, rz: -0.4 });
  e.pylTip = P('pylTip', shard(0.13), { y: 2.14, mat: e.eyeMat, shadow: false });
}

// ---- BRINE -----------------------------------------------------------------
// The theme's language: A SHELL THAT DOES NOT FIT, and something hanging off
// it. Every body is a smooth swollen mass with hard crusted plate laid over it
// a size out - bulging past the plate or hanging below it - and every one of
// them trails an appendage the plate does not cover: a lure, a siphon, a
// frond, a curtain.
//
// Where TEMPEST is held apart and STRATA is cut, BRINE is ENCRUSTED. The rule
// that keeps it from reading as VERDANT's raggedness is that the plates are
// SMOOTH and the thing under them is smooth too - nothing here is torn, it is
// all grown over.

// THE CONDUCTOR. The theme's fork, grown to the size of a boss and held over
// its own head - two enormous prongs sweeping up and out with the core slung
// between them, and arms spread as though it were holding the room open.
//
// The crown is the tell for the whole fight: it BRIGHTENS on every bar, so
// the count the player has to keep is written on the boss rather than only in
// the music.
export function buildConductor(e, g, s) {
  const P = partsFor(e, g, s);
  // The prongs. They carry most of the height, and they are the reason this
  // reads as a conductor rather than as another armoured torso.
  P('condProng', spike(0.16, 1.5, 4), { x: -0.5, y: 2.5, rz: 0.34 });
  P('condProng', spike(0.16, 1.5, 4), { x: 0.5, y: 2.5, rz: -0.34 });
  // THE CROWN CORE, between their roots. Held on the enemy: aiConductor grows
  // and brightens it once per bar, so a player watching the boss and a player
  // listening to the track are counting the same four.
  e.condCore = P('condCore', shard(0.32), { y: 2.32, mat: e.eyeMat, shadow: false });
  // A yoke joining the prongs, so the crown is one object.
  P('condYoke', slab(0.96, 0.16, 0.2), { y: 1.98 });
  // A tall narrow torso - it is a conductor, not a siege engine, and it should
  // look like it could be knocked over even though it cannot.
  P('condTorso', prism(0.36, 0.5, 1.1, 6), { y: 1.28 });
  P('condCollar', prism(0.4, 0.32, 0.2, 6), { y: 1.88 });
  P('condHead', slab(0.3, 0.28, 0.28), { y: 1.72, z: -0.2 });
  // ARMS OUT, and held there. The pose is the whole character: it is not
  // reaching for the player, it is holding the arena.
  P('condArm', slab(0.12, 0.12, 0.9), { x: -0.66, y: 1.62, rz: 0.3, ry: 1.2 });
  P('condArm', slab(0.12, 0.12, 0.9), { x: 0.66, y: 1.62, rz: -0.3, ry: -1.2 });
  P('condHand', shard(0.2), { x: -1.06, y: 1.44 });
  P('condHand', shard(0.2), { x: 1.06, y: 1.44 });
  // Three rings around the waist, spaced - the same stacked-plate motif the
  // capacitor is built from, at boss scale.
  const ring = prism(0.56, 0.56, 0.08, 6);
  P('condRing', ring, { y: 0.94 });
  P('condRing', ring, { y: 0.7 });
  P('condRing', ring, { y: 0.46 });
  // Heavy feet, set wide. It walks, and it must not look like it floats.
  P('condLeg', slab(0.26, 0.44, 0.3), { x: -0.34, y: 0.22 });
  P('condLeg', slab(0.26, 0.44, 0.3), { x: 0.34, y: 0.22 });
  eyes(P, { y: 1.76, x: 0.14, z: -0.34, r: 1.1, mat: e.eyeMat });
}

export const _tempAt = new THREE.Vector3();

export const _tempTo = new THREE.Vector3();

// Distance from (px,pz) to the SEGMENT ab, in the XZ plane. Clamped to the
// segment rather than the infinite line: an arcling's wire ends at the second
// arcling, and a player standing well past it is standing past it.
export function segDistXZ(px, pz, ax, az, bx, bz) {
  const vx = bx - ax;
  const vz = bz - az;
  const len2 = vx * vx + vz * vz;
  if (len2 < 1e-6) return Math.hypot(px - ax, pz - az);
  let t = ((px - ax) * vx + (pz - az) * vz) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (ax + vx * t), pz - (az + vz * t));
}

// How far a wire will stretch before the pair gives up on each other, and how
// close to it counts as standing on it. The width is generous on purpose: the
// wire is drawn as a line one pixel wide and the player is judging it by eye,
// so a hitbox narrower than the eye can measure would read as arbitrary.
export const ARC_TETHER_MAX = 9;

export const ARC_TETHER_W = 1.0;

// Between hits, and what a hit is worth against its melee damage. Well under
// full: the wire is a place the player should not be, not an execution, and
// crossing one on the way past has to be survivable or the pair is a wall.
export const ARC_TICK = 0.5;

export const ARC_TICK_MUL = 0.75;

// Runs at the player like any rusher, and drags a live wire to the nearest
// other arcling as it goes.
//
// THE PAIR IS OWNED BY THE LOWER ID, which is not an implementation detail -
// it is what makes the wire hit ONCE. Both ends running the same search would
// draw the same wire twice and charge the player twice for standing on it,
// and the second copy would also be spending a slot out of the beam pool for
// nothing.
export function aiArcling(e, a) {
  aiMelee(e, a);
  e.arcCd = (e.arcCd || 0) - a.dt;

  let mate = null;
  let best = ARC_TETHER_MAX * ARC_TETHER_MAX;
  for (const o of a.ctx.enemies) {
    if (o === e || o.dead || o.type !== 'arcling') continue;
    // Only ever upward, so each pair has exactly one owner and a line of
    // three arclings is a chain rather than three overlapping wires.
    if (o.id < e.id) continue;
    const dx = o.pos.x - e.pos.x;
    const dz = o.pos.z - e.pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < best) {
      best = d2;
      mate = o;
    }
  }
  if (!mate) return;

  if (a.ctx.effects) a.ctx.effects.beam(e.pos, mate.pos, 0x4ef3ff);
  const p = a.ctx.player;
  if (!p || e.arcCd > 0) return;
  const d = segDistXZ(p.pos.x, p.pos.z, e.pos.x, e.pos.z, mate.pos.x, mate.pos.z);
  if (d > ARC_TETHER_W) return;
  e.arcCd = ARC_TICK;
  a.ctx.onHitPlayer(e.damage * ARC_TICK_MUL, p.pos, e);
  if (a.ctx.effects) {
    _tempAt.set(p.pos.x, 1.0, p.pos.z);
    a.ctx.effects.burst(_tempAt, 0xd6feff, 10, 4, 2, 0.35);
  }
}

// How long the bolt charges, how often, and how far it reaches. The charge is
// long for a ranged attack, and it has to be: it is not a window to dodge in,
// it is a window to get BEHIND something in, and that takes real seconds.
export const COIL_CHARGE = 0.75;

export const COIL_CD = 2.6;

export const COIL_RANGE = 22;

// Where the bolt leaves and lands. Both are chest height rather than ground
// level, so a knee-high crate does not block a shot the player can see over.
export const COIL_EYE = 1.3;

export function aiCoil(e, a) {
  const p = a.ctx.player;
  if (!p) return;

  if (e.coilT > 0) {
    // HOLDS STILL FOR THE WHOLE CHARGE. A coil that kept orbiting while it
    // wound up would drift back into a sightline the player had just broken,
    // which would make the one counter it has unreliable - and it also makes
    // the enemy an easy target for exactly as long as it is dangerous.
    a.vx = 0;
    a.vz = 0;
    e.coilT -= a.dt;
    const k = 1 - Math.max(0, e.coilT) / COIL_CHARGE;
    if (e.coilCore) e.coilCore.scale.setScalar((0.5 + k * 1.8) * e.scale);
    if (a.ctx.effects) {
      // A line to the target for the whole wind-up. The bolt itself is
      // instant, so this is the ONLY thing that tells the player which enemy
      // is about to hit them and from where.
      _tempTo.set(p.pos.x, COIL_EYE, p.pos.z);
      _tempAt.set(e.pos.x, COIL_EYE, e.pos.z);
      a.ctx.effects.beam(_tempAt, _tempTo, 0x2fd8e8);
    }
    if (e.coilT > 0) return;

    // THE SHOT. Line of sight is re-tested HERE, at the instant it fires, and
    // not when it started charging - that gap is the whole mechanic.
    _tempAt.set(e.pos.x, COIL_EYE, e.pos.z);
    _tempTo.set(p.pos.x, COIL_EYE, p.pos.z);
    const blocked = segBlocked(
      e.pos.x, COIL_EYE, e.pos.z, p.pos.x, COIL_EYE, p.pos.z, a.ctx.obstacles
    );
    if (e.coilCore) e.coilCore.scale.setScalar(0.5 * e.scale);
    e._setEyeAlert(false);
    if (blocked) {
      // It fires anyway and loses the cycle. A coil that silently held its
      // shot would leave the player unsure whether the cover had worked.
      if (a.ctx.effects) a.ctx.effects.burst(_tempAt, 0x2fd8e8, 12, 4, 2, 0.4);
      return;
    }
    if (a.ctx.effects) {
      a.ctx.effects.beam(_tempAt, _tempTo, 0xd6feff);
      a.ctx.effects.burst(_tempTo, 0xd6feff, 14, 5, 2, 0.4);
    }
    landHit(e, a.ctx);
    return;
  }

  orbit(e, a, ENEMY_TYPES.coil.orbit);
  if (e.attackCd > 0 || a.dist > COIL_RANGE) return;
  // The wind-up is only started when it can currently see the player, so a
  // coil does not stand behind a pillar charging at a wall - but it is NOT
  // re-checked until the shot, which is what leaves the player the window.
  if (segBlocked(e.pos.x, COIL_EYE, e.pos.z, p.pos.x, COIL_EYE, p.pos.z, a.ctx.obstacles)) return;
  e.attackCd = COIL_CD + Math.random() * 0.6;
  e.coilT = COIL_CHARGE;
  e.flash = 0.12;
  e._setEyeAlert(true);
}

// A FRACTION OF ITS OWN BAR, not a flat hundred. The bar scales with the wave
// and a flat number would have a wave-forty dynamo discharging several times a
// second - the enemy is meant to punish a magazine emptied into it, and that
// is the same magazine at wave four and at wave forty.
export const DYN_CHARGE_FRAC = 0.26;

export const DYN_BLAST_R = 5.4;

// Against its melee damage rather than a number of its own, so the discharge
// scales with the wave exactly as everything else it does.
export const DYN_BLAST_MUL = 1.15;

export const DYN_KNOCK = 4.2;

export function aiDynamo(e, a) {
  aiMelee(e, a);
  if (e.dynStore === undefined) {
    e.dynStore = 0;
    e.dynHp = e.hp;
  }
  // WHAT CAME OFF THE BAR, whatever took it. Read as a delta rather than
  // hooked into takeDamage deliberately: a poison tick, a blast, a melee and a
  // rifle round all charge it, and none of them has to know this type exists.
  const took = e.dynHp - e.hp;
  e.dynHp = e.hp;
  if (took > 0) e.dynStore += took;

  const need = Math.max(1, e.maxHp * DYN_CHARGE_FRAC);
  const k = Math.min(1, e.dynStore / need);
  // The meter is ON THE MODEL. A stored charge nobody can see would make the
  // discharge read as random, and the whole enemy is the player choosing when
  // to keep shooting.
  if (e.dynCore) e.dynCore.scale.setScalar((0.5 + k * 1.5) * e.scale);
  e._setEyeAlert(k > 0.7);
  if (e.dynStore < need) return;

  e.dynStore = 0;
  const p = a.ctx.player;
  if (a.ctx.effects) {
    _tempAt.set(e.pos.x, 0.5, e.pos.z);
    a.ctx.effects.shockwave(_tempAt, 0x4ef3ff, DYN_BLAST_R, 0.4);
    a.ctx.effects.burst(_tempAt, 0xd6feff, 26, 7, 2, 0.6);
  }
  if (a.ctx.sfx) a.ctx.sfx.impact();
  if (!p) return;
  const dx = p.pos.x - e.pos.x;
  const dz = p.pos.z - e.pos.z;
  if (Math.hypot(dx, dz) > DYN_BLAST_R) return;
  a.ctx.onHitPlayer(e.damage * DYN_BLAST_MUL, e.pos, e);
  // Shoved OUT, which is the mercy in it: the discharge ends with the player
  // outside the radius rather than standing in it for the next one.
  if (a.ctx.pullPlayer) a.ctx.pullPlayer(dx, dz, DYN_KNOCK);
}

// The strike, and what it leaves. STORM_LEAD is the mortar's own telegraph,
// and the patch is laid at the same instant the mortar goes off - so the
// circle the player was shown is the circle that stays hostile.
export const STORM_RANGE = 24;

export const STORM_CD = 3.8;

export const STORM_LEAD = 1.4;

export const STORM_R = 3.0;

export const STORM_DMG = 16;

// Short-lived and vicious, which is what separates `shock` from every other
// ground in the game: lava is a place you can cross and this is not.
export const STORM_PATCH_LIFE = 3.2;

export const STORM_PATCH_DPS = 24;

// How far ahead of the player it aims. Less than a full lead - the patch is
// the point, and a strike that landed dead on a running player every time
// would be an unavoidable hit rather than a piece of ground taken away.
export const STORM_AIM = 0.55;

export function aiStormcaller(e, a) {
  orbit(e, a, ENEMY_TYPES.stormcaller.orbit);
  const p = a.ctx.player;
  if (!p) return;

  // A pending strike. Held on the enemy rather than passed to the mortar,
  // because a mortar is a circle and a delay and has nowhere to carry an
  // aftermath - so the caller keeps its own clock and lays the patch when it
  // runs out, on the same frame the shell lands.
  if (e.stormT > 0) {
    e.stormT -= a.dt;
    if (e.stormTip) {
      const k = 1 - Math.max(0, e.stormT) / STORM_LEAD;
      e.stormTip.scale.setScalar((0.6 + k * 1.3) * e.scale);
    }
    if (e.stormT <= 0) {
      a.ctx.addHazard(
        e.stormX, e.stormZ, STORM_R * 0.9, STORM_PATCH_LIFE, STORM_PATCH_DPS, 'shock'
      );
      if (a.ctx.effects) {
        _tempAt.set(e.stormX, 0.4, e.stormZ);
        a.ctx.effects.shockwave(_tempAt, 0x38c6ff, STORM_R, 0.35);
        a.ctx.effects.burst(_tempAt, 0xd6feff, 20, 6, 3, 0.5);
        _tempTo.set(e.stormX, 6, e.stormZ);
        a.ctx.effects.beam(_tempTo, _tempAt, 0xd6feff);
      }
      e._setEyeAlert(false);
    }
    return;
  }

  if (e.attackCd > 0 || a.dist > STORM_RANGE) return;
  e.attackCd = STORM_CD + Math.random() * 0.8;
  e.flash = 0.16;
  e._setEyeAlert(true);
  e.stormX = p.pos.x + (p.vel ? p.vel.x * STORM_AIM : 0);
  e.stormZ = p.pos.z + (p.vel ? p.vel.z * STORM_AIM : 0);
  e.stormT = STORM_LEAD;
  a.ctx.addMortar(e.stormX, e.stormZ, STORM_R, STORM_LEAD, STORM_DMG);
}

// How far the plating reaches, how often it is re-applied, and how many go on
// at once. The cooldown is what makes this a DPS tax rather than a wall: a
// warden's dome is refreshed every frame, and a plate that was would simply be
// a warden with extra steps.
export const CAP_RANGE = 9;

export const CAP_CD = 4.2;

export const CAP_LINKS = 5;

export function aiCapacitor(e, a) {
  orbit(e, a, ENEMY_TYPES.capacitor.orbit);
  const spin = a.dt * 2.2;
  if (e.capCoreA) e.capCoreA.rotation.y += spin;
  if (e.capCoreB) e.capCoreB.rotation.y -= spin;

  e.capCd = (e.capCd || 0) - a.dt;
  if (e.capCd > 0) return;
  e.capCd = CAP_CD;

  let n = 0;
  for (const o of a.ctx.enemies) {
    // NEVER ITSELF, and never a boss. Not itself because the whole answer to a
    // capacitor is to shoot it first and a self-plating one would charge for
    // that twice; not a boss for the conduit's reason - an invisible extra
    // hit on a boss is length the player cannot see the source of.
    if (o === e || o.dead || o.boss || o.plated) continue;
    const dx = o.pos.x - e.pos.x;
    const dz = o.pos.z - e.pos.z;
    if (dx * dx + dz * dz > CAP_RANGE * CAP_RANGE) continue;
    o.plated = true;
    o._applyBodyLook();
    if (a.ctx.effects) a.ctx.effects.beam(e.pos, o.pos, 0x7ef0ff);
    if (++n >= CAP_LINKS) break;
  }
  if (n && a.ctx.effects) {
    _tempAt.set(e.pos.x, 1.1, e.pos.z);
    a.ctx.effects.burst(_tempAt, 0x7ef0ff, 12, 3, 2, 0.45);
  }
}

// How close it has to get to gust, how hard, and how long it stays away
// afterwards. The withdrawal is the window - the same contract the shrike's
// climb is written to.
export const SQUALL_REACH = 3.6;

export const SQUALL_PUSH = 5.2;

export const SQUALL_CD = 2.4;

export const SQUALL_OFF = 1.1;

export function aiSquall(e, a) {
  const p = a.ctx.player;
  if (!p) return;
  e.sqT = (e.sqT || 0) - a.dt;

  // Backing off after a gust. It travels in a straight line away from the
  // player and does nothing, which is the easiest shot it ever offers.
  if (e.sqT > 0) {
    a.vx = -a.nx * a.sp;
    a.vz = -a.nz * a.sp;
    e.group.rotation.z = 0;
    return;
  }

  a.vx = a.px * a.sp;
  a.vz = a.pz * a.sp;
  // Banks as it comes in. The only animation it has, and it is what makes a
  // squall about to gust distinguishable from one crossing the room.
  e.group.rotation.z = Math.min(0.6, Math.max(0, (SQUALL_REACH * 2 - a.dist) * 0.12));
  if (a.dist > SQUALL_REACH) return;

  e.sqT = SQUALL_CD + SQUALL_OFF;
  e.flash = 0.14;
  // NO DAMAGE AT ALL. What it costs the player is the position they had
  // chosen, and that has to be the whole of it - a shove that also hurt would
  // be a rusher that hits from range.
  if (a.ctx.pullPlayer) {
    a.ctx.pullPlayer(p.pos.x - e.pos.x, p.pos.z - e.pos.z, SQUALL_PUSH);
  }
  if (a.ctx.effects) {
    _tempAt.set(p.pos.x, 0.6, p.pos.z);
    a.ctx.effects.shockwave(_tempAt, 0x8fe8ff, 3.4, 0.3);
    a.ctx.effects.burst(_tempAt, 0xd6feff, 16, 5, 2, 0.45);
  }
  if (a.ctx.sfx) a.ctx.sfx.impact();
}

// A pylon does nothing at all, exactly as an anchor does - it stands there and
// it is shot. It pulses on the beat for the anchor's reason: a thing that has
// to be FOUND across a room is found by movement long before it is found by
// colour.
export function aiPylon(e, a) {
  a.vx = 0;
  a.vz = 0;
  if (a.ctx.pulse !== e._lastPulse) {
    e._lastPulse = a.ctx.pulse;
    e.flash = Math.max(e.flash, 0.12);
  }
}

// ---- VOID ------------------------------------------------------------------

// Eight half-beats to the bar - four beats, the ordinary way to count one.
export const COND_HALVES = 8;

export const COND_PYLONS = 3;

// A ring around the ARENA rather than around the boss, for the Pale Crown's
// reason: breaking them has to mean crossing the room the boss is standing in,
// not turning on the spot beside it.
export const COND_PYLON_R = 13;

// How long the wires stay live, how wide they are, and how often one charges
// the player while they are standing on it. Wider than an arcling's wire
// because these are lethal and the player is reading them at boss speed.
export const COND_ARC_TIME = 1.1;

export const COND_ARC_W = 1.6;

export const COND_ARC_TICK = 0.32;

// Against the boss's melee damage rather than a number of its own, so the
// discharge rides bossScale like everything else the fight does.
export const COND_ARC_MUL = 0.85;

export const _condAt = new THREE.Vector3();

export const _condTo = new THREE.Vector3();

// Every wire it currently has: one from the boss to each pylon, and one
// between each pair of pylons. Walked by both halves of the fight - the dim
// draw during the bars and the live test during the discharge - so the lines
// the player was shown are provably the lines that fire.
export function _condWires(e, fn) {
  const live = e.bs.pylons.filter((q) => q && !q.dead);
  for (const q of live) fn(e.pos.x, e.pos.z, q.pos.x, q.pos.z);
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      fn(live[i].pos.x, live[i].pos.z, live[j].pos.x, live[j].pos.z);
    }
  }
  return live.length;
}

export function aiConductor(e, a) {
  const bs = e.bs;
  const ctx = a.ctx;
  if (bs.state === undefined) {
    bs.state = 'walk';
    bs.bar = 0;
    bs.half = 0;
    bs.pylons = [];
    bs.lastPulse = ctx.pulse;
    bs.tick = 0;
    bs.ventNote = 'DISCHARGE';
  }

  // The crown eases back down between bars, so every bar reads as a step up
  // rather than as a steady glow.
  bs.crown = Math.max(0, (bs.crown || 0) - a.dt * 1.6);
  if (e.condCore) e.condCore.scale.setScalar((0.8 + bs.crown * 0.9) * e.scale);

  // ---- discharging --------------------------------------------------------
  if (bs.state === 'discharge') {
    a.vx = 0;
    a.vz = 0;
    bs.t -= a.dt;
    bs.tick -= a.dt;
    const p = ctx.player;
    let onWire = false;
    _condWires(e, (ax, az, bx, bz) => {
      if (ctx.effects) {
        _condAt.set(ax, 1.1, az);
        _condTo.set(bx, 1.1, bz);
        ctx.effects.beam(_condAt, _condTo, 0xffffff);
      }
      if (p && segDistXZ(p.pos.x, p.pos.z, ax, az, bx, bz) < COND_ARC_W) onWire = true;
    });
    if (onWire && bs.tick <= 0) {
      bs.tick = COND_ARC_TICK;
      ctx.onHitPlayer(e.damage * COND_ARC_MUL, p.pos, e);
      if (ctx.effects) {
        _condAt.set(p.pos.x, 1.0, p.pos.z);
        ctx.effects.burst(_condAt, 0xd6feff, 16, 5, 2, 0.4);
      }
    }
    if (bs.t <= 0) {
      // THE PYLONS GO WITH IT. Every cycle starts from an empty room, so the
      // three bars are a fresh puzzle each time rather than a board that fills
      // up until it cannot be cleared.
      for (const q of bs.pylons) {
        if (q && !q.dead) {
          q.dead = true;
          if (ctx.effects) ctx.effects.burst(q.pos, 0x4ef3ff, 18, 5, 2, 0.5);
        }
      }
      bs.pylons.length = 0;
      bs.state = 'walk';
      bs.bar = 0;
      bs.weakOpen = false;
      // `weakOpen` is ONLY the HUD note's gate here. This type has no armor()
      // at all - the Conductor is unarmoured for the whole fight - so unlike
      // Colossus and the Forge the flag changes nothing about damage.
      ctx.bossEvent('vent', e);
    }
    return;
  }

  // ---- walking, and counting ----------------------------------------------
  aiMelee(e, a);

  // The dim draw. Every wire it currently has, every frame, from the moment
  // the pylon goes in - which is the entire warning the discharge gets, and
  // the reason the fight can be played rather than survived.
  _condWires(e, (ax, az, bx, bz) => {
    if (!ctx.effects) return;
    _condAt.set(ax, 1.1, az);
    _condTo.set(bx, 1.1, bz);
    ctx.effects.beam(_condAt, _condTo, 0x2fd8e8);
  });

  // INEQUALITY, NOT ORDER. `pulse` is a counter the music owns and this reads
  // an EDGE off it - the same contract every other beat-driven thing in the
  // game keeps, and the reason a tempo change or a restart cannot desync it.
  if (ctx.pulse === bs.lastPulse) return;
  bs.lastPulse = ctx.pulse;
  if (++bs.half < COND_HALVES) return;
  bs.half = 0;
  bs.bar++;
  bs.crown = 1;
  e.flash = 0.12;

  if (bs.bar <= COND_PYLONS) {
    // Spread around the ring rather than dropped at random, so three pylons
    // make a triangle across the room instead of a cluster in one corner.
    const ang = (bs.bar / COND_PYLONS) * Math.PI * 2 + (bs.spin || (bs.spin = Math.random() * 6.28));
    const px = Math.max(-19, Math.min(19, Math.cos(ang) * COND_PYLON_R));
    const pz = Math.max(-19, Math.min(19, Math.sin(ang) * COND_PYLON_R));
    if (ctx.addAnchor) {
      const q = ctx.addAnchor(px, pz, 'pylon');
      if (q) bs.pylons.push(q);
    }
    if (ctx.effects) {
      _condAt.set(e.pos.x, 2.4, e.pos.z);
      _condTo.set(px, 1.6, pz);
      ctx.effects.beam(_condAt, _condTo, 0xd6feff);
      ctx.effects.burst(_condTo, 0x4ef3ff, 18, 5, 2, 0.5);
    }
    if (ctx.sfx) ctx.sfx.impact();
    return;
  }

  bs.state = 'discharge';
  bs.t = COND_ARC_TIME;
  bs.tick = 0;
  bs.weakOpen = true;
  ctx.bossEvent('vent', e);
  ctx.bossEvent('charge', e);
  if (ctx.effects) {
    _condAt.set(e.pos.x, 0.6, e.pos.z);
    ctx.effects.shockwave(_condAt, 0x4ef3ff, 6, 0.4);
  }
}

const TYPES = {
  // ---- TEMPEST ------------------------------------------------------------
  //
  // The theme of CHARGE, and the only one whose threats are LINES BETWEEN TWO
  // POINTS rather than areas around one. Every other theme in the game asks
  // the player about a place - the fire is here, the ice is there, the boulder
  // is coming down this lane. TEMPEST asks about a SEGMENT: two arclings and
  // the span between them, a coil and the sightline it is holding, a
  // Conductor and each pylon it has raised. There is nothing dangerous at
  // either end and everything dangerous in the middle.
  //
  // WHICH MAKES IT THE THEME ANSWERED BY GEOMETRY. Not by leaving an area, and
  // not by outrunning anything - by noticing which two things are joined and
  // standing off the line, or by cutting it at one end.
  //
  // THE SHARED SILHOUETTE IS THE GAP THAT SPARKS. Every one of these is built
  // as a pair of prongs or forks with a bright core suspended in the space
  // between them, on thin rods rather than mass. Where VOID is incomplete and
  // STRATA is cut, TEMPEST is HELD APART - the gap is not missing, it is the
  // working part, and the eye reads it as something under load.

  // Tethers itself to the nearest other arcling and drags a live wire between
  // them. Standing on that wire hurts; standing beside either arcling does
  // not.
  //
  // The only crowd-GEOMETRY enemy in the game. Everything else in the roster
  // is answered one body at a time, and this one cannot be - a single arcling
  // is a weak rusher and a pair of them is a fence across the room. The answer
  // is to kill ONE, which cuts the line, and the mistake is to fight the crowd
  // in the order it arrives.
  arcling: {
    hp: 30, speed: 4.0, damage: 7, value: 210, color: 0x4ef3ff, eye: 0xd6feff,
    scale: 0.9, radius: 0.44, mass: 1,
    melee: { windup: 0.32, start: 1.4, hit: 2.0, cd: 1.0 },
    build: buildArcling, ai: aiArcling,
  },

  // The one ranged enemy in the game that is not beaten by moving.
  //
  // It charges a bolt between its horns for a beat and then fires it INSTANTLY
  // - there is no projectile in the air to dodge, so a player who watches the
  // charge and steps sideways is hit anyway. What beats it is putting
  // something solid in the way before the charge finishes: the line of sight
  // is re-tested at the instant of the shot, and a blocked coil discharges
  // into the obstacle and loses the whole cycle.
  //
  // So it is the enemy that makes COVER the answer, in a game whose every
  // other threat is answered by leaving where you are - and it is deliberately
  // paired in the same theme with the arcling and the Conductor, both of which
  // punish standing still. TEMPEST asks the player to keep choosing between
  // them.
  coil: {
    hp: 24, speed: 2.2, damage: 14, value: 270, color: 0x2fd8e8, eye: 0xd6feff,
    scale: 1.0, radius: 0.48, mass: 1,
    orbit: { dist: 13, band: 2.5, out: 0.85, in: -0.7, strafe: 0.4, flip: 2, flipVar: 2 },
    // NO `proj` BLOCK, and that absence is the mechanic: a coil never puts
    // anything in the air. The bolt is a beam drawn for a tenth of a second
    // and damage applied on the same frame.
    build: buildCoil, ai: aiCoil,
  },

  // Punishes the reflex the whole rest of the game trains: shoot the big thing
  // until it stops.
  //
  // It STORES what it is hit with, and every time the meter fills it dumps the
  // charge back out as a shockwave. So emptying a magazine into it at close
  // range is the worst thing a player can do, and the same magazine fired from
  // eight metres out is free. It is not immune and it is not armoured - the
  // health comes off exactly as it looks like it does - the cost is paid in
  // WHERE the player was standing when the meter filled.
  //
  // The meter is a fraction of its own bar rather than a flat number, because
  // its bar scales with the wave and a flat hundred would discharge four times
  // a second at wave forty.
  dynamo: {
    hp: 165, speed: 1.5, damage: 20, value: 340, color: 0x1fb6c9, eye: 0xd6feff,
    scale: 1.4, radius: 0.62, mass: 3,
    melee: { windup: 0.7, start: 2.6, hit: 3.2, cd: 2.1 },
    build: buildDynamo, ai: aiDynamo,
  },

  // Marks the floor and strikes it - and unlike every other telegraphed strike
  // in the game the mark is only half of it. What lands is a bolt, and what it
  // LEAVES is an electrified patch that goes on being lethal for a few seconds
  // afterwards.
  //
  // So the circle is not "be elsewhere for a moment", it is "that ground is
  // gone now". Siege's barrage and the geode's spikes are both answered by
  // stepping out and stepping straight back in; this one is answered by
  // giving the position up.
  stormcaller: {
    hp: 44, speed: 1.9, damage: 0, value: 300, color: 0x38c6ff, eye: 0xd6feff,
    scale: 1.15, radius: 0.55, mass: 1,
    orbit: { dist: 15, band: 2.5, out: 0.7, in: -0.5, strafe: 0.3, flip: 2.5, flipVar: 2 },
    build: buildStormcaller, ai: aiStormcaller,
  },

  // No attack. It plates everything around it with a single-hit shield, and
  // the shield has to be broken before any of that enemy's health comes off.
  //
  // DELIBERATELY NOT THE WARDEN. A warden's dome is total immunity that lapses
  // the moment it dies, so it converts a crowd into a wall and the answer is
  // simply to kill the warden. A plate is one hit, it stays on the body after
  // the capacitor is dead, and it is re-applied on a cooldown rather than
  // refreshed every frame - so ignoring a capacitor costs one extra shot per
  // enemy per cycle rather than costing everything, and the decision it asks
  // for is about DPS rather than about targeting.
  capacitor: {
    hp: 62, speed: 2.1, damage: 0, value: 340, color: 0x7ef0ff, eye: 0xd6feff,
    scale: 1.15, radius: 0.5, mass: 1,
    orbit: { dist: 11, band: 2, out: 0.8, in: -0.6, strafe: 0.35, flip: 2, flipVar: 2 },
    build: buildCapacitor, ai: aiCapacitor,
  },

  // No attack at all. It comes over the top and SHOVES - off the deck the
  // player climbed to, out of the doorway they were holding, into whatever
  // else the wave has on the floor.
  //
  // The only flier that deals no damage of any kind, and the only enemy in the
  // game whose whole payload is the player's own position being wrong. It is
  // the air half of what the singularity does on the ground, and the two are
  // in different themes on purpose: a well takes the ground the player was
  // leaving and a squall takes the ground they were standing on.
  squall: {
    hp: 52, speed: 4.2, damage: 0, value: 300, color: 0x8fe8ff, eye: 0xd6feff,
    scale: 1.05, radius: 0.5, mass: 1,
    fly: { height: 3.6 },
    hitbox: { r: 0.6, y: 0.5 },
    build: buildSquall, ai: aiSquall,
  },

  // THE CONDUCTOR'S PYLON. Structurally the Pale Crown's anchor - it stands
  // there, it does nothing, and the only thing it has to do is be found and
  // broken - and it is a separate type rather than a reskin because the two
  // are read completely differently: an anchor is a lock on a door, and a
  // pylon is one END OF A LINE the player can see aimed across the room.
  pylon: {
    hp: 120, speed: 0, damage: 0, value: 90, color: 0x4ef3ff, eye: 0xd6feff,
    scale: 1.2, radius: 0.5, mass: 6,
    hitbox: { r: 0.6, y: 0.9 },
    statusMul: 0.5, fearMode: 'stagger', entropyExempt: true,
    build: buildPylon, ai: aiPylon,
  },

  // TEMPEST's boss, and the only fight in the game whose clock is the MUSIC.
  //
  // It counts bars on Music.pulse, exactly as the kiln's sweep and the Forge's
  // do - and unlike either of those the count is the whole fight rather than
  // one attack inside it. On each of the first three bars it drives a PYLON
  // into the floor and draws a live line to it. On the fourth it DISCHARGES
  // along every line it still has, and along every line between one pylon and
  // another, and the arena is cut into wedges by the lines the player failed
  // to remove.
  //
  // SO THE FIGHT IS PLAYED BETWEEN THE BARS, not against the boss. Three bars
  // to break as many pylons as the player can afford to turn away for, one bar
  // that charges them for the ones they left. Every pylon broken is a line
  // that does not fire, and a player who breaks all three takes a discharge
  // with nothing in it.
  //
  // Unarmoured throughout, and that is deliberate: the Forge, the Crown and
  // the Overgrowth all gate their damage, so the fourth new boss gates the
  // PLAYER'S POSITION instead and leaves the health bar alone.
  conductor: {
    hp: 3400, speed: 2.4, damage: 26, value: 6000, color: 0x4ef3ff, eye: 0xd6feff,
    scale: 2.9, radius: 1.75, mass: 8, boss: true,
    hitbox: { r: 0.72, y: 0.84 },
    statusMul: 0.3, freezeSlow: true, slowFactor: 0.75, freezeVuln: 1.0,
    entropyExempt: true, fearMode: 'stagger',
    melee: { windup: 0.6, start: 3.2, hit: 4.0, cd: 2.0 },
    build: buildConductor, ai: aiConductor,
  },
};

Object.assign(ENEMY_TYPES, TYPES);
