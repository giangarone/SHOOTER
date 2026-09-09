// VERDANT's six enemies and its boss.
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
  ENEMY_TYPES, GAS_DPS, SHARED_MATS, _blinkAt, aiMelee, eyes, landHit, lump,
  orbit, partsFor, prism, releaseMarks, shard, slab, spike,
} from './shared.js';

// What the Overgrowth's shut canopy takes off a hit. Up here with the other
// two for the same reason - it is read inside the ENEMY_TYPES literal below.
// Low, because unlike every other gate in the game this one is entirely the
// player's to open: they are not waiting for it, they are deciding whether the
// eight metres is worth it, and a shut canopy has to make that a real question
// rather than a formality.
export const OVERGROWTH_ARMOR = 0.22;

// VERDANT's five. Every number here is a DELAY - the theme's whole idea is
// that nothing happens when it is thrown, so what these describe is how long
// the player has between being shown a thing and being charged for it.
//
// The thornling's charge. The wind-up is long because it is the entire
// counterplay: once it goes it cannot steer, so the player is stepping off a
// line rather than outrunning anything.
export const THORN_TELL = 0.55;

export const THORN_RUN = 1.15;

export const THORN_RUN_MUL = 2.9;

export const THORN_CD = 2.6;

export const THORN_RANGE = 18;

// Below this it just swings - a charge at arm's length is unreadable and
// unfair, and the melee cycle is a better answer at that distance anyway.
export const THORN_MIN = 5;

// The sporegun's seed. TWO SECONDS on the floor with the circle filling, which
// is by a distance the most generous telegraph in the game: it has to be, or a
// gunner whose rounds are harmless in the air would be a gunner that does
// nothing at all.
export const SPORE_CD = 3.6;

export const SPORE_RANGE = 22;

export const SPORE_SPROUT = 2.0;

export const SPORE_RADIUS = 2.6;

export const SPORE_DAMAGE = 16;

// The bramblehide's thorns. A slow tick, and a reach that has to sit OUTSIDE
// its own swing - which is the whole reason this number is 4.6 and not the 3.0
// it started at.
//
// At 3.0 the aura was entirely inside the melee's own hit range of 3.5, so
// there was no distance at which a player could feel the thorns as a separate
// thing: every metre where they were being pricked was a metre where they were
// also being swung at, and the mechanic was just extra melee damage with a
// different colour of particle. The band between the swing and 4.6 is the
// enemy - close enough to be a decision, far enough to be its own.
//
// Still short. It must read as "next to it" rather than "near it", or the
// player is being taxed for fighting in the same room.
export const BRAMBLE_REACH = 4.6;

export const BRAMBLE_TICK = 0.9;

export const BRAMBLE_DPS = 7;

// The heartwood's mending. As a FRACTION of the target's own maximum, so it is
// worth the same on a chaser as on a tank - a flat rate would either be
// nothing on a brute or absurd on a rusher.
export const HEART_RANGE = 9;

export const HEART_RATE = 0.05;

export const HEART_LINKS = 4;

// The mothcap's cloud. It trails one continuously rather than dropping them,
// so the interval is short and the life is long - the cloud IS the enemy, and
// it has to still be there after the enemy is not.
export const MOTH_HIGH = 2.4;

export const MOTH_DROP = 0.7;

export const MOTH_RADIUS = 2.6;

export const MOTH_LIFE = 5.0;

export const MOTH_STANDOFF = 7;

export const _verdAt = new THREE.Vector3();

// Bottom-heavy and hunched, tapering the opposite way to a tank, with a
// drooping nozzle. Read: everything it has is going onto the floor.
export function buildBlight(e, g, s) {
  const P = partsFor(e, g, s);
  // WIDE AND FLAT ON THE FLOOR - the opposite of the bomber's stilts. Nothing
  // else in the roster is broader than it is tall, and that alone is enough to
  // tell the two heavy types apart at a glance.
  P('blightGut', lump(0.5), { y: 0.36, sx: 1.3, sy: 0.6, sz: 1.15 });
  // A hump on the back, so the outline has a peak that is not the head.
  P('blightHump', lump(0.3), { y: 0.62, z: 0.22, sy: 0.85 });
  // The head is low and slung FORWARD off the front of the gut, and the
  // nozzle carries on past it - together they are the long snout that reads
  // from the side.
  P('blightHead', prism(0.16, 0.24, 0.34, 5), { y: 0.5, z: -0.5, rx: -1.15 });
  P('blightNozzle', prism(0.05, 0.13, 0.62, 5), {
    y: 0.34, z: -0.82, rx: -Math.PI / 2.1, mat: SHARED_MATS.gunmetal,
  });
  // Four legs splayed out sideways, crab-like, and barely clearing the floor.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    P('blightLeg', slab(0.08, 0.34, 0.08), {
      x: Math.cos(a) * 0.44, y: 0.16, z: Math.sin(a) * 0.38,
      rz: -Math.cos(a) * 0.75, rx: Math.sin(a) * 0.5,
    });
  }
  P('blightSac', lump(0.24), { x: -0.4, y: 0.6, z: 0.06, mat: SHARED_MATS.blightSac });
  P('blightSac', lump(0.24), { x: 0.4, y: 0.6, z: 0.06, mat: SHARED_MATS.blightSac });
  eyes(P, { y: 0.62, x: 0.08, z: -0.58, r: 0.75, mat: e.eyeMat });
}

// A stack of cracked chunks with the heat showing between them. Read: it is
// made of the thing it is leaving on the ground.
// ---- VERDANT ---------------------------------------------------------------
// The theme's language: bark-plated trunks with things sprouting OUT of them
// at angles - fronds, thorns, spore caps. Nothing here has a clean edge, which
// is the whole family read: EMBER is lumpen rock, RIME is flat facets, and
// VERDANT is ragged. Built from the same primitives; what differs is that
// almost every part is rotated off axis, because a plant does not line up.

// Leaning hard forward from the ankles, all of it pointed one way. Read: it is
// going to go in a straight line and it is going to keep going.
export function buildThornling(e, g, s) {
  const P = partsFor(e, g, s);
  // A long low body raked forward - much more horizontal than the chaser's,
  // because the chaser CLOSES and this one CHARGES, and the difference has to
  // be legible before it commits.
  P('thornBody', prism(0.3, 0.2, 0.8, 5), { y: 0.78, z: 0.06, rx: -0.72 });
  // The ram: a blunt wedge low and well forward, the leading edge of the whole
  // silhouette. Not a snout - a snout reads as a head, and this is a tool.
  P('thornRam', spike(0.24, 0.5, 5), { y: 0.62, z: -0.6, rx: -Math.PI / 2 });
  P('thornBrow', slab(0.36, 0.12, 0.26), { y: 0.86, z: -0.4, rx: -0.5 });
  // Thorns swept BACK along the body, so it reads as moving even standing
  // still, and so the outline breaks up along its length.
  const thornGeo = spike(0.06, 0.42, 4);
  P('thornSpine', thornGeo, { x: -0.18, y: 1.0, z: 0.16, rx: 1.1, rz: -0.3 });
  P('thornSpine', thornGeo, { x: 0.18, y: 1.02, z: 0.14, rx: 1.1, rz: 0.3 });
  P('thornSpine', thornGeo, { y: 1.12, z: 0.3, rx: 1.3, s: 0.8 });
  // Legs gathered under the chest rather than spread - a coiled stance.
  P('thornLeg', slab(0.11, 0.5, 0.12), { x: -0.17, y: 0.26, z: -0.06, rx: 0.3 });
  P('thornLeg', slab(0.11, 0.5, 0.12), { x: 0.17, y: 0.26, z: -0.06, rx: 0.3 });
  P('thornHaunch', slab(0.13, 0.42, 0.14), { x: -0.17, y: 0.5, z: 0.3, rx: -0.45 });
  P('thornHaunch', slab(0.13, 0.42, 0.14), { x: 0.17, y: 0.5, z: 0.3, rx: -0.45 });
  eyes(P, { y: 0.94, x: 0.1, z: -0.34, r: 0.8, mat: e.eyeMat });
}

// Upright and asymmetric, with a bulbous pod on one side - the gunner read,
// grown rather than built.
export function buildSporegun(e, g, s) {
  const P = partsFor(e, g, s);
  P('sporeTrunk', prism(0.22, 0.32, 0.86, 5), { y: 0.86 });
  P('sporeHead', lump(0.18), { y: 1.42, sy: 0.8 });
  // THE POD IS THE SILHOUETTE, and it is what the seeds come out of: a heavy
  // sac carried outboard on a bent stalk, so the outline is lopsided.
  P('sporeStalk', slab(0.09, 0.4, 0.09), { x: 0.3, y: 1.14, rz: -0.6 });
  P('sporePod', lump(0.28), { x: 0.5, y: 1.36, sy: 1.25 });
  // Seeds visibly sitting in the pod's mouth - the tell for what it throws.
  P('sporeSeed', shard(0.09), { x: 0.5, y: 1.62, mat: SHARED_MATS.blightSac, shadow: false });
  // Fronds off the other shoulder, drooping. They balance the pod without
  // adding mass, which is what keeps the pod reading as the heavy side.
  const frondGeo = spike(0.05, 0.44, 4);
  P('sporeFrond', frondGeo, { x: -0.26, y: 1.2, rz: 1.3, rx: -0.3 });
  P('sporeFrond', frondGeo, { x: -0.3, y: 1.02, rz: 1.6, rx: 0.2, s: 0.85 });
  P('sporeLeg', slab(0.1, 0.5, 0.1), { x: -0.13, y: 0.26, rz: 0.08 });
  P('sporeLeg', slab(0.1, 0.5, 0.1), { x: 0.13, y: 0.26, rz: -0.08 });
  eyes(P, { y: 1.44, x: 0.09, z: -0.17, r: 0.8, mat: e.eyeMat });
}

// Wide, planted and COVERED - the brute read, and the silhouette has to say
// "do not stand next to this" before the aura ever proves it.
export function buildBramblehide(e, g, s) {
  const P = partsFor(e, g, s);
  P('brambleBody', prism(0.52, 0.6, 0.86, 6), { y: 0.62 });
  P('brambleBack', lump(0.42), { y: 1.0, z: 0.16, sy: 0.72 });
  P('brambleHead', lump(0.22), { y: 1.16, z: -0.34, sy: 0.8 });
  // THORNS EVERYWHERE, and they have to project past the body on every bearing
  // or the enemy is just a lump: the reach of the aura is what the spines are
  // drawing, so they are long and they point OUT.
  const spineGeo = spike(0.07, 0.62, 4);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.3;
    P('brambleSpine', spineGeo, {
      x: Math.cos(a) * 0.5, y: 0.8 + Math.sin(i * 2.1) * 0.24, z: Math.sin(a) * 0.5,
      rz: Math.cos(a) * -1.25, rx: Math.sin(a) * 1.25,
    });
  }
  P('brambleLeg', slab(0.18, 0.36, 0.18), { x: -0.28, y: 0.18 });
  P('brambleLeg', slab(0.18, 0.36, 0.18), { x: 0.28, y: 0.18 });
  P('brambleArm', slab(0.17, 0.56, 0.17), { x: -0.56, y: 0.7, rz: 0.34 });
  P('brambleArm', slab(0.17, 0.56, 0.17), { x: 0.56, y: 0.7, rz: -0.34 });
  eyes(P, { y: 1.18, x: 0.11, z: -0.5, r: 0.9, mat: e.eyeMat });
}

// A tree. Legless, symmetrical, wider at the top than the bottom - the support
// read (conduit, warden, bellows, hoarfrost) grown instead of built, and the
// only thing in the roster that looks like it was always here.
export function buildHeartwood(e, g, s) {
  const P = partsFor(e, g, s);
  // A tapering trunk on a root ball. It stands ON the floor rather than
  // floating, which is the one place this breaks the support silhouette - and
  // deliberately, because being ROOTED is what it does.
  P('heartRoots', lump(0.44), { y: 0.2, sy: 0.5 });
  P('heartTrunk', prism(0.2, 0.34, 1.0, 5), { y: 0.82 });
  // THE CANOPY, and the wide top that makes it read as a tree from a
  // silhouette: three overlapping caps at different heights and angles.
  P('heartCanopy', lump(0.46), { y: 1.42, sy: 0.62 });
  P('heartCanopy', lump(0.34), { x: -0.26, y: 1.62, sy: 0.6, ry: 0.8 });
  P('heartCanopy', lump(0.3), { x: 0.28, y: 1.58, sy: 0.6, ry: 1.6 });
  // The heart itself, glowing in a split in the trunk - where the beams come
  // from, and the only bright thing on it.
  P('heartCore', shard(0.18), { y: 1.0, z: -0.22, mat: e.eyeMat, shadow: false });
  // Roots thrown out at the base, so it is visibly gripping the floor.
  const rootGeo = spike(0.09, 0.46, 4);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    P('heartRoot', rootGeo, {
      x: Math.cos(a) * 0.34, y: 0.14, z: Math.sin(a) * 0.34,
      rz: Math.cos(a) * -1.5, rx: Math.sin(a) * 1.5,
    });
  }
  eyes(P, { y: 1.3, x: 0.1, z: -0.4, r: 0.85, mat: e.eyeMat });
}

// A cap on a body, flying LOW. Read against the crowd rather than the ceiling,
// so unlike the other two fliers it has to be a distinct shape at eye height -
// which is why it is a wide mushroom cap with a body hanging under it, and not
// another plate.
export function buildMothcap(e, g, s) {
  const P = partsFor(e, g, s);
  // The cap: broad, domed and ragged-edged. The widest thing in the theme.
  P('mothCap', prism(0.16, 0.66, 0.34, 7), { y: 0.24 });
  P('mothCapRim', prism(0.68, 0.6, 0.09, 7), { y: 0.06 });
  // Gills under it - what the spores fall out of, and what makes the underside
  // read as something other than a flat disc when it is above you.
  const gillGeo = slab(0.05, 0.06, 0.5);
  for (let i = 0; i < 6; i++) {
    P('mothGill', gillGeo, {
      y: -0.02, ry: (i / 6) * Math.PI, mat: SHARED_MATS.blightSac, shadow: false,
    });
  }
  // A stubby body slung underneath. Short, so it does not turn the silhouette
  // into a hovering figure - the CAP has to be the thing.
  P('mothStem', prism(0.13, 0.17, 0.34, 5), { y: -0.24 });
  P('mothSac', lump(0.19), { y: -0.44, sy: 0.85 });
  // Two ragged wings, held low and swept - enough to say it flies, not enough
  // to compete with the cap.
  P('mothWing', prism(0.06, 0.3, 0.05, 3), { x: -0.44, y: -0.16, rz: 0.5, sz: 1.3 });
  P('mothWing', prism(0.06, 0.3, 0.05, 3), { x: 0.44, y: -0.16, rz: -0.5, sz: 1.3 });
  eyes(P, { y: -0.28, x: 0.09, z: -0.16, r: 0.8, mat: e.eyeMat });
}

// VERDANT's boss: a tree that has taken the room. The heartwood's language at
// boss scale - root ball, tapering trunk, layered canopy - with the one thing
// no ordinary VERDANT enemy has, a canopy that OPENS.
//
// It never moves, so unlike every other boss it is not read by its motion and
// has to be unmistakable standing still. That is what the canopy is for: it is
// most of the silhouette, and the fight's only state change is written on it.
export function buildOvergrowth(e, g, s) {
  const P = partsFor(e, g, s);
  // A vast root ball spread across the floor. Wide and low, so it reads as
  // something that grew here rather than something that walked in.
  P('ogRoots', lump(0.9), { y: 0.26, sy: 0.42 });
  const rootGeo = spike(0.16, 0.9, 4);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    P('ogRoot', rootGeo, {
      x: Math.cos(a) * 0.72, y: 0.18, z: Math.sin(a) * 0.72,
      rz: Math.cos(a) * -1.45, rx: Math.sin(a) * 1.45,
    });
  }
  // The trunk: split, so the core sits in a visible cleft rather than behind
  // bark. The player has to be able to see what they are shooting at.
  P('ogTrunkL', prism(0.24, 0.42, 1.5, 5), { x: -0.2, y: 1.0, rz: 0.07 });
  P('ogTrunkR', prism(0.24, 0.42, 1.5, 5), { x: 0.2, y: 1.0, rz: -0.07 });

  // THE CORE, in the cleft. Held on the enemy: it swells when the canopy
  // opens, so the window is legible on the body and not only in the numbers.
  e.ogCore = P('ogCore', shard(0.34), {
    y: 1.2, z: -0.2, mat: SHARED_MATS.blightSac, shadow: false,
  });

  // THE CANOPY, and the fight. Four heavy caps that draw APART and lift when
  // the player comes inside the window - held on the enemy so aiOvergrowth can
  // slide them, the way the Forge's shutters are.
  e.canopy = [];
  const capGeo = lump(0.62);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    e.canopy.push(P('ogCanopy', capGeo, {
      x: Math.cos(a) * 0.42, y: 2.05, z: Math.sin(a) * 0.42, sy: 0.5, ry: a,
    }));
  }
  // Fronds hanging off the canopy's edge, long and drooping. They are what
  // makes the top read as foliage rather than as four boulders.
  const frondGeo = spike(0.09, 0.9, 4);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.2;
    P('ogFrond', frondGeo, {
      x: Math.cos(a) * 0.86, y: 1.72, z: Math.sin(a) * 0.86,
      rz: Math.cos(a) * -0.5, rx: Math.sin(a) * 0.5,
    });
  }
  // Two heavy boughs it swings with, low and reaching.
  P('ogBough', slab(0.26, 1.0, 0.26), { x: -0.78, y: 1.1, rz: 0.5 });
  P('ogBough', slab(0.26, 1.0, 0.26), { x: 0.78, y: 1.1, rz: -0.5 });
  eyes(P, { y: 1.5, x: 0.15, z: -0.4, r: 1.5, mat: e.eyeMat });
}

// SPITS a glob that arcs across the arena and leaves its pool where it lands.
//
// The pool used to be created directly at the player's feet with no projectile
// and no travel time - mechanically it was a lead shot, but with nothing in the
// air to read it played as the floor turning hostile at random, and there was
// no way to answer it. Now the same lead is baked into the glob's aim (see
// _spawnSpit in main.js, which leads by most of the real flight time), so a
// player who keeps running in a straight line still gets caught and one who
// breaks off does not. The threat is unchanged; it is now legible.
//
// Fired from the nozzle the model has always had, not from the body centre.
export function aiBlight(e, a) {
  orbit(e, a, ENEMY_TYPES.blight.orbit);
  if (e.attackCd > 0 || a.dist > 20) return;
  e.attackCd = 3.2 + Math.random() * 0.8;
  e.flash = 0.15;
  a.ctx.addSpit(e.pos.x + a.nx * 0.8, 1.0, e.pos.z + a.nz * 0.8);
  if (a.ctx.effects) {
    _blinkAt.set(e.pos.x, 1.1, e.pos.z);
    a.ctx.effects.burst(_blinkAt, ENEMY_TYPES.blight.color, 10, 3, 2, 0.5);
  }
}

// Closes, plants, commits, overshoots, comes back. The heading is frozen at
// the END of the tell, exactly as the ashwing's is - what the player is
// stepping off is the line they were standing on when it reared, not the one
// they are on when it arrives.
export function aiThornling(e, a) {
  if (!e.tl) e.tl = { state: 'walk', t: 0, hx: 0, hz: 1 };
  const tl = e.tl;
  tl.t -= a.dt;

  if (tl.state === 'run') {
  // RAISING THE VELOCITY IS NOT ENOUGH. Enemy.update clamps how far a body may
  // move in a frame to `speed * stepMul`, and stepMul defaults to 1.4 - so an
  // ai() that multiplies its own velocity by three and does not touch it moves
  // at 1.4x and looks like a slightly hurried walk. Every committed charge in
  // the game raises it (the shrike's dive, Colossus's and Siege's) and all
  // three of the ones added with the themes had silently not been.
    e.stepMul = THORN_RUN_MUL;
    const sp = e._effSpeed() * THORN_RUN_MUL;
    // NO STEERING. Off the frozen heading, not off nx/nz.
    a.vx = tl.hx * sp;
    a.vz = tl.hz * sp;
    // Contact during a charge is a hit, from any state - the same rule the
    // melee cycle uses, because a body moving this fast passing through the
    // player without touching them is the bug players actually notice.
    if (a.dist < 2.0 && e.chargeHit !== true) {
      e.chargeHit = true;
      landHit(e, a.ctx);
    }
    // Ends on its clock, on a wall, or on the arena edge - anything else grinds
    // it along the boundary for the rest of the wave.
    if (tl.t <= 0 || e.blockedBy > 0.05 || Math.abs(e.pos.x) > 20 || Math.abs(e.pos.z) > 20) {
      tl.state = 'walk';
      tl.t = THORN_CD * e.rate;
      e.chargeHit = false;
      e._setEyeAlert(false);
    }
    return;
  }

  e.stepMul = 1.4;
  if (tl.state === 'tell') {
    // Planted, aimed, and visibly winding. The one moment it is stationary.
    a.vx = 0;
    a.vz = 0;
    if (tl.t <= 0) {
      tl.hx = a.nx;
      tl.hz = a.nz;
      tl.state = 'run';
      tl.t = THORN_RUN;
      e.chargeHit = false;
    }
    return;
  }

  // Walking. It still swings if the player comes to it - a charger with no
  // melee is answered by standing next to it.
  aiMelee(e, a);
  if (tl.t <= 0 && a.dist < THORN_RANGE && a.dist > THORN_MIN) {
    tl.state = 'tell';
    tl.t = THORN_TELL;
    e._setEyeAlert(true);
    e.flash = 0.12;
  }
}

// Lobs a seed. The seed does nothing; two seconds later the ground does.
export function aiSporegun(e, a) {
  orbit(e, a, ENEMY_TYPES.sporegun.orbit);
  if (e.attackCd > 0 || a.dist > SPORE_RANGE) return;
  e.attackCd = SPORE_CD + Math.random() * 0.9;
  e.flash = 0.15;
  a.ctx.addSpit(e.pos.x + a.nx * 0.8, 1.4, e.pos.z + a.nz * 0.8, 'seed');
  if (a.ctx.effects) {
    _verdAt.set(e.pos.x, 1.5, e.pos.z);
    a.ctx.effects.burst(_verdAt, ENEMY_TYPES.sporegun.color, 9, 3, 2, 0.5);
  }
}

// A brute that costs you for being next to it. The aura is checked against the
// PLAYER only - a thorn field that also hurt its own crowd would make the
// enemy a liability to the wave it is supposed to anchor.
export function aiBramblehide(e, a) {
  aiMelee(e, a);
  e.thornCd = (e.thornCd || 0) - a.dt;
  if (a.dist > BRAMBLE_REACH) return;
  if (e.thornCd > 0) return;
  e.thornCd = BRAMBLE_TICK;
  // Through onHitPlayer rather than as a hazard: it is a hit from an enemy,
  // so the ward, the dodge and every other thing that reads a hit gets to
  // look at it.
  a.ctx.onHitPlayer(BRAMBLE_DPS * BRAMBLE_TICK, e.pos, e);
  if (a.ctx.effects) {
    _verdAt.set(e.pos.x, 0.9, e.pos.z);
    a.ctx.effects.burst(_verdAt, 0x6b8f3a, 6, 2.5, 1, 0.35);
  }
}

// Roots and mends. The one support whose effect the player cannot see on
// themselves at all, so every bit of the feedback is on the BEAM.
export function aiHeartwood(e, a) {
  orbit(e, a, ENEMY_TYPES.heartwood.orbit);
  let drawn = 0;
  for (const o of a.ctx.enemies) {
    // Bosses excluded, for the conduit's reason: healing the one fight the
    // player is already reading closely, invisibly, is the worst version of
    // this mechanic.
    if (o === e || o.dead || o.boss || o.type === 'heartwood') continue;
    if (o.hp >= o.maxHp) continue;
    const dx = o.pos.x - e.pos.x;
    const dz = o.pos.z - e.pos.z;
    if (dx * dx + dz * dz > HEART_RANGE * HEART_RANGE) continue;
    o.hp = Math.min(o.maxHp, o.hp + o.maxHp * HEART_RATE * a.dt);
    if (drawn++ < HEART_LINKS && a.ctx.effects) {
      a.ctx.effects.beam(e.pos, o.pos, 0x8fbf4a);
    }
  }
  e._setEyeAlert(drawn > 0);
}

// Drifts at head height trailing spores. It holds a short standoff rather than
// closing, because the cloud is the attack and a mothcap sitting on the player
// would just be a slower husk.
export function aiMothcap(e, a) {
  e.hoverY = MOTH_HIGH;
  const sp = e._effSpeed();
  const push = a.dist < MOTH_STANDOFF ? -0.7 : 0.8;
  // A wide lazy arc rather than a straight approach: it is the one flier that
  // is IN the crowd, and it has to read as drifting through it.
  a.vx = (a.nx * push - a.nz * 0.6) * sp;
  a.vz = (a.nz * push + a.nx * 0.6) * sp;

  e.dripCd = (e.dripCd || 0) - a.dt;
  if (e.dripCd > 0) return;
  e.dripCd = MOTH_DROP;
  // Under itself, and it OUTLIVES it - killing one overhead leaves the cloud
  // exactly where the player is standing, which is the whole bargain.
  a.ctx.addHazard(e.pos.x, e.pos.z, MOTH_RADIUS, MOTH_LIFE, GAS_DPS, 'gas');
  if (a.ctx.effects) {
    _verdAt.set(e.pos.x, e.pos.y - 0.4, e.pos.z);
    a.ctx.effects.burst(_verdAt, 0xa8c93a, 6, 1.6, -1, 0.6);
  }
}

// ---- the Overgrowth ---------------------------------------------------------
// Inside this, the canopy is open and the boss takes full damage. It is also
// exactly where its rings land, which is the entire fight.
export const OG_WINDOW = 8;

// The ring it lays when the player is inside the window. Gapped, like every
// other ring in the game, because a closed one around a player who has chosen
// to be there is a tax rather than a decision.
export const OG_RING_R = 6.5;

export const OG_RING_N = 7;

export const OG_RING_GAP = 2;

export const OG_RING_CD = 4.5;

// The creeper: a LINE of thorns marching outward toward wherever the player is
// standing, each one sprouting a little later than the last. It is what
// answers standing at range and doing nothing, which a rooted boss would
// otherwise have no reply to at all.
export const OG_CREEP_CD = 5.5;

export const OG_CREEP_N = 5;

export const OG_CREEP_STEP = 3.6;

export const OG_CREEP_LEAD = 0.55;

export const OG_THORN_R = 2.4;

export const OG_THORN_DELAY = 1.3;

export const OG_THORN_DMG = 20;

export const _ogAt = new THREE.Vector3();

export function aiOvergrowth(e, a) {
  const bs = e.bs;
  const ctx = a.ctx;
  if (bs.state === undefined) {
    bs.ringCd = OG_RING_CD * 0.6;
    bs.creepCd = OG_CREEP_CD * 0.5;
    bs.openT = 0;
    bs.state = 'rooted';
  }

  // IT NEVER MOVES. Not a state, not a condition - there is no branch in this
  // function that writes a velocity, and `speed` is zero on the type as well
  // so nothing else can either.
  a.vx = 0;
  a.vz = 0;

  // The window is a pure function of range, recomputed every frame, so the
  // armour and the model can never disagree about whether it is open.
  bs.open = a.dist < OG_WINDOW;
  bs.openT += ((bs.open ? 1 : 0) - bs.openT) * Math.min(1, a.dt * 5);
  if (e.canopy) {
    for (let i = 0; i < e.canopy.length; i++) {
      const c = e.canopy[i];
      const ang = (i / e.canopy.length) * Math.PI * 2 + 0.4;
      // Out and up: the caps part and lift, so the cleft and the core inside
      // it come into view from the front rather than only from above.
      const r = (0.42 + bs.openT * 0.5) * e.scale;
      c.position.set(Math.cos(ang) * r, (2.05 + bs.openT * 0.34) * e.scale, Math.sin(ang) * r);
      c.rotation.z = bs.openT * (Math.cos(ang) * 0.5);
      c.rotation.x = bs.openT * (Math.sin(ang) * 0.5);
    }
  }
  if (e.ogCore) e.ogCore.scale.setScalar((0.8 + bs.openT * 0.75) * e.scale);
  e._setEyeAlert(bs.open);

  // It still swings at anything that comes to it. The window has to cost
  // something even when the thorns are not up.
  if (a.dist < 6) aiMelee(e, a);

  // ---- the ring -----------------------------------------------------------
  // Only while the player is inside the window. This is the price of the
  // damage they are choosing to do.
  bs.ringCd -= a.dt;
  if (bs.open && bs.ringCd <= 0) {
    bs.ringCd = OG_RING_CD * e.rate;
    const gapAt = (Math.random() * OG_RING_N) | 0;
    const off = Math.random() * Math.PI * 2;
    for (let i = 0; i < OG_RING_N; i++) {
      if (((i - gapAt + OG_RING_N) % OG_RING_N) < OG_RING_GAP) continue;
      const ang = off + (i / OG_RING_N) * Math.PI * 2;
      ctx.addMortar(
        e.pos.x + Math.cos(ang) * OG_RING_R, e.pos.z + Math.sin(ang) * OG_RING_R,
        OG_THORN_R, OG_THORN_DELAY, OG_THORN_DMG
      );
    }
    e.flash = 0.18;
    if (ctx.effects) {
      _ogAt.set(e.pos.x, 0.8, e.pos.z);
      ctx.effects.shockwave(_ogAt, 0x7ea63c, OG_RING_R, 0.4);
    }
    ctx.bossEvent('charge', e);
  }

  // ---- the creeper --------------------------------------------------------
  // The answer to standing at range. A line of thorns walking outward along
  // the player's own bearing, each sprouting later than the last - so it
  // arrives as a thing coming TOWARD them rather than as a hit.
  bs.creepCd -= a.dt;
  if (!bs.open && bs.creepCd <= 0 && a.dist < 30) {
    bs.creepCd = OG_CREEP_CD * e.rate;
    for (let i = 1; i <= OG_CREEP_N; i++) {
      const d = i * OG_CREEP_STEP;
      ctx.addMortar(
        e.pos.x + a.nx * d, e.pos.z + a.nz * d,
        OG_THORN_R, OG_THORN_DELAY + i * OG_CREEP_LEAD, OG_THORN_DMG
      );
    }
    e.flash = 0.15;
    ctx.bossEvent('charge', e);
  }
}

// ---- the Conductor ----------------------------------------------------------
// The only fight in the game whose clock is the music. It counts BARS on
// Music.pulse - the same half-beat edge the kiln sweeps on and the Forge turns
// on - raises a pylon on each of the first three and discharges along every
// line it has on the fourth.
//
// So the fight is played BETWEEN the bars. Three bars to break as many pylons
// as the player can afford to turn away from the boss for, and one bar that
// charges them for the ones they left standing. A player who clears all three
// takes a discharge with nothing in it; a player who ignores them takes six
// live wires across the room at once.

const TYPES = {
  // Punishes holding one good spot. Lobs pools that make the floor where you
  // are standing cost health, so the answer is always to give up the position.
  // Does no direct damage: the ground it leaves behind is the whole threat.
  blight: {
    head: { r: 0.3, y: 0.62 },
    hp: 48, speed: 1.9, damage: 0, value: 240, color: 0x7ac943, eye: 0xd6ff8a,
    scale: 1.15, radius: 0.55, mass: 1,
    orbit: { dist: 12, band: 2, out: 0.7, in: -0.5, strafe: 0.3, flip: 2.5, flipVar: 2 },
    // The blight's spit and the pool it leaves wear the same toxic green, so
    // the glob in the air and the patch it becomes are obviously one thing.
    // A Spit carries its own flight, so there is no speed or damage curve
    // here - the payload is the ground it grows.
    proj: { core: 0xd6ff8a, glow: 0xaaff2a, scale: 1.3 },
    build: buildBlight, ai: aiBlight,
  },

  // ---- the rest of VERDANT ------------------------------------------------
  //
  // The theme of THINGS THAT ARRIVE LATE. EMBER puts fire where you are and
  // RIME takes your legs now; nothing in VERDANT happens at the moment it is
  // thrown. A seed lands and is harmless for two seconds. A charge commits and
  // then cannot be called back. A cloud outlives the thing that made it. A
  // wound closes back up behind you.
  //
  // WHICH MAKES IT THE THEME ABOUT MEMORY rather than reflexes: nothing here
  // is dodged, it is all anticipated, and the mistake it punishes is treating
  // a floor you have already looked at as a floor you still know.
  //
  // THE SHARED SILHOUETTE IS GROWTH. Bark-plated trunks with things sprouting
  // OUT of them at angles - fronds, thorns, spore caps - so the outline is
  // ragged where EMBER's is lumpen and RIME's is faceted. Nothing in this
  // theme has a clean edge.

  // Charges in straight lines and cannot turn while it does. It overshoots,
  // has to swing wide and come back, and the whole enemy is that loop: the
  // player is never running from it, they are stepping off its line.
  //
  // Cheap and fast, because a charger that also had to be shot down twice
  // would be a brute. What it costs is the ground you were standing on when
  // it committed - which is exactly the theme's bargain, one second early.
  thornling: {
    head: { r: 0.3, y: 0.94 },
    hp: 40, speed: 3.2, damage: 11, value: 210, color: 0x7ea63c, eye: 0xd6ff8a,
    scale: 1.0, radius: 0.5, mass: 1,
    melee: { windup: 0.4, start: 1.5, hit: 2.1, cd: 1.2 },
    build: buildThornling, ai: aiThornling,
  },

  // Lobs seeds that do NOTHING when they land, and sprout two seconds later
  // into a burst of thorns. The circle fills on the floor while they do, so it
  // is the most generous threat in the game and the easiest to forget about.
  //
  // A gunner whose rounds are harmless in the air is a strange thing, and it
  // is the point: a sporegun cannot punish you at all in the moment. What it
  // does is take the floor you will want in two seconds, which is only a
  // problem for a player who is being pushed onto it by something else - so it
  // is the type that makes the rest of the theme's crowd matter.
  sporegun: {
    head: { r: 0.3, y: 1.44 },
    hp: 28, speed: 2.2, damage: 7, value: 230, color: 0x9fbf4a, eye: 0xd6ff8a,
    scale: 1.05, radius: 0.48, mass: 1,
    orbit: { dist: 12, band: 2, out: 0.7, in: -0.5, strafe: 0.4, flip: 2.3, flipVar: 2 },
    proj: { core: 0xd6ff8a, glow: 0x7ea63c, scale: 1.1 },
    build: buildSporegun, ai: aiSporegun,
  },

  // Covered in thorns. Standing next to it costs health whether or not it is
  // swinging, and MELEEING it costs more - so it is the one enemy in the game
  // that answers the melee button, and the one that punishes using a big body
  // as cover from the crowd behind it.
  //
  // Priced in the lower half of the brute band, because the aura is damage it
  // deals for free and the rule is that a type is charged for what it does
  // without being asked.
  bramblehide: {
    head: { r: 0.32, y: 1.18 },
    hp: 150, speed: 1.6, damage: 14, value: 320, color: 0x6b8f3a, eye: 0xd6ff8a,
    scale: 1.45, radius: 0.62, mass: 2,
    melee: { windup: 0.8, start: 2.9, hit: 3.5, cd: 2.4 },
    build: buildBramblehide, ai: aiBramblehide,
  },

  // Roots itself and closes the wave's wounds. No attack: what it costs is the
  // damage you already did, which is the one thing in the game a player cannot
  // see being taken away from them.
  //
  // SO IT IS LOUD ABOUT IT. A beam to everything it is mending, and it stops
  // dead the moment it dies - the conduit's shape, doing the one job no other
  // support does. It is the DPS check of the roster: a player who ignores it
  // is not losing, they are simply not winning, and working out why is the
  // whole puzzle.
  heartwood: {
    head: { r: 0.3, y: 1.3 },
    hp: 74, speed: 1.9, damage: 0, value: 380, color: 0x8fbf4a, eye: 0xd6ff8a,
    scale: 1.25, radius: 0.55, mass: 2,
    orbit: { dist: 12, band: 2.5, out: 0.6, in: -0.7, strafe: 0.25, flip: 2.6, flipVar: 2 },
    build: buildHeartwood, ai: aiHeartwood,
  },

  // The only LOW flier in the game. It drifts at head height trailing a cloud
  // of spores that outlives it, so it is not something to be shot down so much
  // as something to be shot down FROM SOMEWHERE ELSE - killing one overhead
  // leaves the cloud exactly where you are standing.
  //
  // Low on purpose. The other two fliers are read against the ceiling and
  // answered by looking up; this one is in the crowd, at the height everything
  // else is, and the mistake it punishes is treating the air as a separate
  // problem from the floor.
  mothcap: {
    head: { r: 0.28, y: -0.28 },
    hp: 44, speed: 3.1, damage: 0, value: 290, color: 0xa8c93a, eye: 0xd6ff8a,
    scale: 1.0, radius: 0.5, mass: 1,
    fly: { height: 2.4 },
    hitbox: { r: 0.62, y: 0.5 },
    build: buildMothcap, ai: aiMothcap,
  },

  // VERDANT's boss, and the only thing in the game that never takes a step.
  //
  // IT IS ROOTED. That single decision is the fight: the player can always
  // walk away from it, so the pressure cannot come from the boss chasing and
  // has to come from the ARENA closing in instead. It grows creepers - lines
  // of thorns marching outward along the ground toward wherever the player is
  // standing - and rings itself with them when they come near.
  //
  // AND THE PLAYER CHOOSES THE WINDOW. Its canopy is shut and armoured at any
  // distance, and OPENS when they come inside eight metres. There is no clock
  // on it at all: unlike the Forge, which decides when it is vulnerable, and
  // the Pale Crown, whose anchors decide, this one is decided entirely by
  // where the player stands - and inside eight metres is exactly where the
  // rings land. The whole fight is that one trade, priced in seconds.
  overgrowth: {
    head: { r: 0.42, y: 1.5 },
    hp: 3500, speed: 0, damage: 26, value: 6500, color: 0x7ea63c, eye: 0xd6ff8a,
    scale: 3.1, radius: 2.0, mass: 10, boss: true,
    hitbox: { r: 0.76, y: 0.8 },
    statusMul: 0.3, freezeSlow: true, slowFactor: 0.75, freezeVuln: 1.0,
    entropyExempt: true, fearMode: 'stagger',
    // It cannot chase, so it swings at anything that comes to it - which is
    // the same eight metres the canopy opens at. Standing in the window is
    // meant to cost something even when the thorns are not up.
    melee: { windup: 0.7, start: 3.4, hit: 4.2, cd: 2.2 },
    // Open when the player is near. NOT a state it sets itself - `bs.open` is
    // recomputed from range every frame in aiOvergrowth, so the armour and the
    // model can never disagree about it.
    armor: (e) => (e.bs.open ? 1 : OVERGROWTH_ARMOR),
    armorDefault: (e) => (e.bs.open ? 1 : OVERGROWTH_ARMOR),
    build: buildOvergrowth, ai: aiOvergrowth,
    cleanup: releaseMarks,
  },
};

Object.assign(ENEMY_TYPES, TYPES);
