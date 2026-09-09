// PLAGUE's six enemies and its boss.
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
  ENEMY_TYPES, GAS_DPS, SHARED_MATS, SPLITTER_BODY, SPLITTER_EYE, _blinkAt,
  _bossAt, aiMelee, eyes, geo, lump, orbit, partsFor, prism, shard, slab,
  spike,
} from './shared.js';

// A husk's burst. Wider and shorter-lived than a thrown cloud: it is a body
// coming apart rather than a lobbed canister, and it has to cover the ground
// around the corpse - which is the ground the player was standing on when they
// killed it - rather than deny a position for a long time.
export const HUSK_CLOUD_RADIUS = 3.4;

export const HUSK_CLOUD_LIFE = 5.5;
// What a VITRIOL throws is sized in main.js beside the blight's lob (SPIT_GAS),
// because the two share one throw and differ only in what grows out of it.

// Two shards stacked with a lit seam between them. Read: this is already two
// things, and killing it will prove it.
export function buildSplitter(e, g, s) {
  const P = partsFor(e, g, s);
  P('splitterLower', shard(0.36), { y: 0.58, sy: 0.9 });
  P('splitterUpper', shard(0.29), { y: 1.08, sy: 0.9 });
  // A tapered foot instead of legs: it should not look like it walks.
  P('splitterFoot', spike(0.24, 0.34, 5), { y: 0.17, rx: Math.PI });

  const core = P('splitterCore', shard(0.13), {
    y: 0.84, mat: SHARED_MATS.splitterCore, shadow: false,
  });
  e.coreMesh = core;
  const ring = new THREE.Mesh(
    geo('splitterRing', () => new THREE.TorusGeometry(0.27, 0.032, 6, 12)),
    SHARED_MATS.splitterRing
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.84 * s;
  ring.scale.setScalar(s);
  e.ringMesh = ring;
  g.add(ring);
  eyes(P, { y: 1.12, x: 0.1, z: -0.22, r: 0.8, mat: e.eyeMat });
}

export function buildHusk(e, g, s) {
  const P = partsFor(e, g, s);
  P('huskGut', lump(0.46), { y: 0.82, sx: 1.25, sy: 1.15, sz: 1.05 });
  P('huskChest', prism(0.42, 0.5, 0.34, 6), { y: 1.32 });
  // THE SACS. Two on the shoulders and one slung under the gut, all three in
  // the gas's own colour and all three out past the body's outline, so the
  // thing is lumpy from every angle.
  P('huskSac', lump(0.26), { x: -0.46, y: 1.34, z: 0.04, mat: SHARED_MATS.huskSac });
  P('huskSac', lump(0.26), { x: 0.46, y: 1.34, z: 0.04, mat: SHARED_MATS.huskSac });
  P('huskSac', lump(0.3), { y: 0.56, z: -0.34, sy: 0.8, mat: SHARED_MATS.huskSac });
  // Split down the front, and the split is what it comes apart along.
  P('huskSeam', slab(0.07, 0.62, 0.1), { y: 1.0, z: -0.42, mat: SHARED_MATS.huskSac, shadow: false });
  // Head sunk between the shoulders - no neck at all, which is the read for
  // something that does not turn quickly.
  P('huskHead', prism(0.15, 0.2, 0.24, 5), { y: 1.58, z: -0.1 });
  // Thick, short, splayed legs. A brute stands; it does not run.
  P('huskThigh', slab(0.22, 0.34, 0.24), { x: -0.26, y: 0.42, rz: 0.16 });
  P('huskThigh', slab(0.22, 0.34, 0.24), { x: 0.26, y: 0.42, rz: -0.16 });
  P('huskFoot', slab(0.28, 0.2, 0.34), { x: -0.28, y: 0.12 });
  P('huskFoot', slab(0.28, 0.2, 0.34), { x: 0.28, y: 0.12 });
  eyes(P, { y: 1.6, x: 0.09, z: -0.22, r: 0.85, mat: e.eyeMat });
}

// The blight's build with the nozzle pointed at the SKY. Bottom-heavy,
// hunched, four splayed legs - it belongs to the same family and is meant to,
// because until the glob lands the two are the same problem. The mortar is
// what tells them apart: a blight sprays forward, this one lobs.
export function buildVitriol(e, g, s) {
  const P = partsFor(e, g, s);
  P('vitriolGut', lump(0.46), { y: 0.4, sx: 1.15, sy: 0.75, sz: 1.1 });
  // THE MORTAR. A wide-mouthed tube standing up out of the back, flared at the
  // top - the one part of the outline that breaks the skyline, and the reason
  // this reads as artillery rather than as another crawler.
  P('vitriolTube', prism(0.26, 0.14, 0.66, 6), {
    y: 0.96, z: 0.12, rx: -0.22, mat: SHARED_MATS.gunmetal,
  });
  P('vitriolMouth', prism(0.3, 0.22, 0.12, 6), {
    y: 1.3, z: 0.18, rx: -0.22, mat: SHARED_MATS.gunmetal,
  });
  // What it is loaded with, glowing in the throat of the tube.
  P('vitriolCharge', lump(0.16), { y: 1.24, z: 0.16, mat: SHARED_MATS.vitriolSac, shadow: false });
  P('vitriolSac', lump(0.22), { x: -0.42, y: 0.5, z: -0.1, mat: SHARED_MATS.vitriolSac });
  P('vitriolSac', lump(0.22), { x: 0.42, y: 0.5, z: -0.1, mat: SHARED_MATS.vitriolSac });
  // Head low and forward, under the tube, so the two never merge.
  P('vitriolHead', prism(0.14, 0.2, 0.3, 5), { y: 0.44, z: -0.5, rx: -1.2 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    P('vitriolLeg', slab(0.09, 0.36, 0.09), {
      x: Math.cos(a) * 0.42, y: 0.18, z: Math.sin(a) * 0.36,
      rz: -Math.cos(a) * 0.7, rx: Math.sin(a) * 0.45,
    });
  }
  eyes(P, { y: 0.56, x: 0.08, z: -0.56, r: 0.75, mat: e.eyeMat });
}

// A hunched body carrying a cracked drum on its shoulder. The drum is what it
// fires out of and the crack is where the light comes from, so the one bright
// thing on it is also the one part that matters.
export function buildLesion(e, g, s) {
  const P = partsFor(e, g, s);
  // THE DRUM, split across the top. Two halves with a gap, held high on one
  // shoulder so the outline is lopsided from any bearing.
  // TILTED APART AND CLEAR OF THE BODY. The first draft had the two halves
  // barely above a torso the same width, so they merged into it and a lesion
  // came out as a featureless box on legs - the same failure the dynamo's
  // drums and the vent's funnel had. They are wider than the body now, held a
  // head above it, and hinged apart so the split is a real notch in the top of
  // the outline rather than a line on a surface.
  P('lesDrumL', prism(0.3, 0.32, 0.42, 6), { x: -0.16, y: 1.44, z: -0.04, rz: 0.42 });
  P('lesDrumR', prism(0.3, 0.32, 0.42, 6), { x: 0.42, y: 1.38, z: -0.04, rz: -0.42 });
  e.lesCore = P('lesCore', shard(0.15), {
    x: 0.13, y: 1.42, z: -0.04, mat: e.eyeMat, shadow: false,
  });
  P('lesMount', slab(0.14, 0.34, 0.14), { x: 0.14, y: 1.12, rz: -0.2 });
  // A NARROWER stooped body under it, leaning away from the weight - the drum
  // only overhangs if there is less body than drum.
  P('lesTorso', prism(0.2, 0.28, 0.6, 5), { y: 0.72, rz: -0.24 });
  // The seam down the front, open. Small, but it is what makes the body read
  // as the same object as the drum rather than as a base for it.
  P('lesSeam', slab(0.08, 0.4, 0.06), { y: 0.76, z: -0.24, mat: e.eyeMat, shadow: false });
  P('lesHead', prism(0.12, 0.16, 0.2, 5), { x: -0.18, y: 1.1, z: -0.1, rz: 0.3 });
  P('lesArm', slab(0.09, 0.09, 0.4), { x: -0.28, y: 0.86, z: -0.16, rx: 0.4 });
  P('lesLeg', slab(0.11, 0.44, 0.12), { x: -0.16, y: 0.22 });
  P('lesLeg', slab(0.11, 0.44, 0.12), { x: 0.13, y: 0.22 });
  eyes(P, { y: 1.12, x: 0.07, z: -0.22, r: 0.65, mat: e.eyeMat });
}

// A stooped thing with an empty ribcage and two long hooks. It has to read as
// something that COLLECTS: the hollow chest is where the body it is raising
// would go, and the hooks are what it reaches with.
export function buildCarrion(e, g, s) {
  const P = partsFor(e, g, s);
  // THE CAGE, burst open at the front. Four ribs sweeping forward with nothing
  // between them - the hole in the middle is most of the silhouette.
  for (let i = 0; i < 4; i++) {
    const sx = i < 2 ? -1 : 1;
    const t = i % 2;
    P('carRib', slab(0.06, 0.62, 0.09), {
      x: (0.16 + t * 0.14) * sx, y: 1.0, z: -0.1 - t * 0.06,
      rz: (0.3 + t * 0.25) * sx, rx: -0.2,
    });
  }
  P('carSpine', slab(0.14, 0.8, 0.14), { y: 1.0, z: 0.18, rx: 0.24 });
  P('carPelvis', prism(0.24, 0.18, 0.22, 5), { y: 0.56, z: 0.1 });
  // A long neck and a small down-turned head, so it is stooped over the hole
  // rather than standing over it.
  P('carNeck', slab(0.09, 0.34, 0.09), { y: 1.5, z: 0.06, rx: -0.5 });
  P('carSkull', spike(0.13, 0.36, 5), { y: 1.62, z: -0.2, rx: -2.0 });
  // THE HOOKS. Long, thin and hanging well below the body - the theme's soft
  // thing showing through is the light on their tips.
  P('carArm', slab(0.07, 0.66, 0.07), { x: -0.4, y: 0.92, rz: 0.16 });
  P('carArm', slab(0.07, 0.66, 0.07), { x: 0.4, y: 0.92, rz: -0.16 });
  P('carHook', spike(0.09, 0.34, 4), { x: -0.44, y: 0.46, rx: 2.6, mat: e.eyeMat, shadow: false });
  P('carHook', spike(0.09, 0.34, 4), { x: 0.44, y: 0.46, rx: 2.6, mat: e.eyeMat, shadow: false });
  P('carLeg', slab(0.09, 0.5, 0.1), { x: -0.15, y: 0.25, rz: 0.1 });
  P('carLeg', slab(0.09, 0.5, 0.1), { x: 0.15, y: 0.25, rz: -0.1 });
  eyes(P, { y: 1.6, x: 0.08, z: -0.3, r: 0.7, mat: e.eyeMat });
}

// A fat sack under two small ragged wings, split along its underside. Read
// from below - the only place it is seen from - it is a bag about to open.
export function buildBloatfly(e, g, s) {
  const P = partsFor(e, g, s);
  // THE SACK. Most of the body, and deliberately far too heavy for the wings
  // above it: a flier that looked airworthy would not read as something that
  // is going to fall on somebody.
  P('bloatSack', lump(0.5), { y: 0.5, sy: 1.25 });
  // The split, along the bottom. Bright, and it is the whole tell.
  P('bloatSplit', slab(0.1, 0.06, 0.66), { y: 0.14, mat: e.eyeMat, shadow: false });
  P('bloatSplit2', slab(0.5, 0.06, 0.1), { y: 0.16, mat: e.eyeMat, shadow: false });
  // Two small wings, high and swept back. Short on purpose - the outline has
  // to be sack first and wings second.
  P('bloatWing', slab(0.44, 0.05, 0.2), { x: -0.42, y: 1.02, z: 0.1, rz: 0.35, ry: 0.4 });
  P('bloatWing', slab(0.44, 0.05, 0.2), { x: 0.42, y: 1.02, z: 0.1, rz: -0.35, ry: -0.4 });
  // A small head pushed out in front of the sack, and three stubby legs
  // trailing under it.
  P('bloatHead', prism(0.14, 0.18, 0.2, 5), { y: 0.86, z: -0.34, rx: -0.5 });
  for (let i = 0; i < 3; i++) {
    P('bloatLeg', slab(0.05, 0.32, 0.05), {
      x: -0.2 + i * 0.2, y: 0.02, z: 0.16, rx: 0.3,
    });
  }
  eyes(P, { y: 0.9, x: 0.1, z: -0.46, r: 0.7, mat: e.eyeMat });
}

// ---- SOLAR -----------------------------------------------------------------
// The theme's language: A NARROW CORE CARRYING ONE BIG FLAT PANEL. A mask, a
// shield, a lens, a ring - always a single broad plate held clear of a thin
// body, and always the widest thing in the outline. Where PLAGUE is splitting
// and BRINE hangs, SOLAR is a thing HOLDING A MIRROR UP.

// Two crystals side by side with a lit gap between them. The whole model is
// the mechanic: it is already two, and it is going to be four.
export function buildSchism(e, g, s) {
  const P = partsFor(e, g, s);
  // Held far enough apart that the gap survives a three-quarter view - at
  // +/-0.24 the two halves overlapped into one diamond and the whole read of
  // the fight was lost.
  P('schismHalf', shard(0.42), { x: -0.38, y: 1.05, sy: 1.2, sz: 0.85 });
  P('schismHalf', shard(0.42), { x: 0.38, y: 1.05, sy: 1.2, sz: 0.85 });
  P('schismKeel', spike(0.36, 0.62, 6), { y: 0.36, rx: Math.PI });
  const a = P('schismCore', shard(0.3), { y: 1.02, mat: e.bodyMat, shadow: false });
  const b = P('schismGlow', shard(0.22), {
    y: 1.02, mat: SHARED_MATS.splitterCore, shadow: false,
  });
  e.coreMesh = a;
  e.ringMesh = b;
  eyes(P, { y: 1.3, x: 0.24, z: -0.24, r: 1.2, mat: e.eyeMat });
}

export function aiSplitter(e, a) {
  aiMelee(e, a);
  e.coreMesh.rotation.y += a.dt * 3;
  e.ringMesh.rotation.z += a.dt * 2;
}

export const _plagueAt = new THREE.Vector3();

// The bloatfly's burst, and how long the gas over it lasts. Wider and shorter
// than a husk's: a husk bursts where the player chose to stand and this one
// bursts where they used to, so it has to cover more ground for less time.
export const BLOAT_CLOUD_R = 3.6;

export const BLOAT_CLOUD_LIFE = 5.5;

export const LESION_RANGE = 18;

export const LESION_CD = 2.6;

export const LESION_BURST = 3;

export const LESION_GAP = 0.13;

export const LESION_SPREAD = 0.075;

// Fires a short burst and gets nothing else. Everything that makes it matter
// is in the ROUND - see the `leave` row on its proj block, and the branch in
// _updateProjectiles that reads it - which is correct twice over: the enemy is
// a delivery system for a puddle, and a lesion that also manoeuvred cleverly
// would be paying twice for one idea.
export function aiLesion(e, a) {
  orbit(e, a, ENEMY_TYPES.lesion.orbit);
  if (e.lesN > 0) {
    e.lesT -= a.dt;
    if (e.lesT > 0) return;
    e.lesT = LESION_GAP;
    e.lesN--;
    // SPREAD, and it is the mechanic rather than a handicap: three rounds on
    // exactly the same line would leave one puddle, and what this enemy is
    // for is writing a WIDTH of bad floor across wherever the player went.
    a.ctx.addProjectile(
      e.pos.x, 1.1, e.pos.z, 'lesion', e._projScale(),
      (e.lesN - 1) * LESION_SPREAD
    );
    if (e.lesN <= 0) e._setEyeAlert(false);
    return;
  }
  if (e.attackCd > 0 || a.dist > LESION_RANGE) return;
  e.attackCd = LESION_CD + Math.random() * 0.7;
  e.lesN = LESION_BURST;
  e.lesT = 0;
  e.flash = 0.12;
  e._setEyeAlert(true);
  if (e.lesCore) e.lesCore.scale.setScalar(1.5 * e.scale);
}

// How far it reaches, how long between raisings, and what a raised body comes
// back with. The fraction is low and the cooldown is long: a carrion is meant
// to make clearing the room feel wrong, not to double the wave.
export const CARRION_RANGE = 11;

export const CARRION_CD = 6.0;

export const CARRION_HP = 0.4;

// What it will raise. Bosses and the inert helper types are excluded for the
// conduit's reason - an extra boss nobody can see the source of - and so is
// anything already raised once, which is what `revenant` is for.
export const CARRION_SKIP = new Set(['carrion', 'anchor', 'pylon', 'turret']);

export function aiCarrion(e, a) {
  const ctx = a.ctx;
  orbit(e, a, ENEMY_TYPES.carrion.orbit);
  e.carCd = (e.carCd || 0) - a.dt;
  // The hooks lift as it charges, so a carrion about to raise something is
  // visibly about to.
  const ready = e.carCd <= 0;
  e._setEyeAlert(ready);

  // WHAT DIED NEARBY THIS FRAME. Read off the enemy list rather than hooked
  // into the kill path, because the kill path is main.js's sweep and a support
  // enemy has no business being wired into it - `dead` is set before that
  // sweep runs and cleared by nothing, so one pass here sees every body on the
  // frame it falls and never sees it twice.
  if (!ready) return;
  for (const o of ctx.enemies) {
    if (!o.dead || o.boss || o.revenant || o.raised) continue;
    if (CARRION_SKIP.has(o.type)) continue;
    const dx = o.pos.x - e.pos.x;
    const dz = o.pos.z - e.pos.z;
    if (dx * dx + dz * dz > CARRION_RANGE * CARRION_RANGE) continue;
    // Marked on the CORPSE, so two carrions cannot raise the same body twice
    // and so a body that has already been through this cannot come back again.
    o.raised = true;
    e.carCd = CARRION_CD;
    if (ctx.reanimate) ctx.reanimate(o.pos.x, o.pos.z, o.type, CARRION_HP);
    if (ctx.effects) {
      _plagueAt.set(o.pos.x, 0.9, o.pos.z);
      ctx.effects.beam(e.pos, _plagueAt, 0xcc3d8a);
      ctx.effects.shockwave(_plagueAt, 0xcc3d8a, 2.4, 0.4);
      ctx.effects.burst(_plagueAt, 0xffb0e8, 22, 5, 2, 0.6);
    }
    if (ctx.sfx) ctx.sfx.impact();
    break;
  }
}

// How close it has to be over them before it commits, and how long the drop
// takes. Slow and obvious: the whole enemy is a thing the player is given time
// to walk out from under.
export const BLOAT_DROP_R = 2.6;

export const BLOAT_FALL = 5.0;

export function aiBloatfly(e, a) {
  const ctx = a.ctx;
  if (e.diving) {
    // COMMITTED, and it does not steer. Same contract the ashwing's run and
    // the thornling's charge are written to: what the player is being asked to
    // read is a piece of ground, and a dive that followed them would not be
    // one.
    a.vx = 0;
    a.vz = 0;
    e.hoverY = 0;
    e.flyRate = BLOAT_FALL;
    // It bursts on landing through the SAME onDeath the gun triggers, so the
    // cloud is identical however it came down and there is only one place the
    // burst is written.
    if (e.pos.y < 0.5) {
      e.dead = true;
      e.value = Math.round(e.value * 0.4);
    }
    return;
  }
  a.vx = a.px * a.sp;
  a.vz = a.pz * a.sp;
  // The sack swells as it comes over. It is the only animation it has, and it
  // is what makes the dive readable a moment before it starts.
  e.group.rotation.z = Math.sin(ctx.time * 2 + e.id) * 0.1;
  if (a.dist > BLOAT_DROP_R || e.pos.y < 1.5) return;
  e.diving = true;
  e.flash = 0.2;
  e._setEyeAlert(true);
  if (ctx.effects) {
    _plagueAt.set(e.pos.x, 0.3, e.pos.z);
    ctx.effects.shockwave(_plagueAt, 0xcc3d8a, BLOAT_CLOUD_R, 0.5);
  }
}

// ---- SOLAR -----------------------------------------------------------------

export function aiVitriol(e, a) {
  orbit(e, a, ENEMY_TYPES.vitriol.orbit);
  if (e.attackCd > 0 || a.dist > 20) return;
  e.attackCd = 3.4 + Math.random() * 0.8;
  e.flash = 0.15;
  a.ctx.addSpit(e.pos.x + a.nx * 0.8, 1.0, e.pos.z + a.nz * 0.8, 'gas');
  if (a.ctx.effects) {
    _blinkAt.set(e.pos.x, 1.1, e.pos.z);
    a.ctx.effects.burst(_blinkAt, ENEMY_TYPES.vitriol.color, 10, 3, 2, 0.5);
  }
}

// SCHISM. Melee pressure, a radial volley, and the split.
//
// It used to be melee and the split alone, which made it the one boss you
// could fight from across the room: back off, shoot, and the whole fight was
// a walk backwards. The BURST is what closes that off - eight rounds at once,
// evenly around the circle, so distance stops being safety and the answer is
// to be behind cover or moving across it rather than away from it.
//
// EVERY PART FIRES. Four halves each throwing eight rounds is the point of
// splitting it: the boss gets more dangerous as it comes apart, not less.
// The cooldown is per part and randomised at spawn, so the halves fall out of
// step with each other instead of firing as one wall.
export const SCHISM_BURST_CD = 4.2;

export const SCHISM_BURST_SHOTS = 8;

// Seconds the core flares before the rounds leave. The volley covers every
// bearing, so it cannot be dodged by direction - only by reading it early and
// getting something between you and it.
export const SCHISM_TELL = 0.45;

// Split thresholds, in fractions of the part's own health pool. THREE of them
// now: 2 parts, then 4, then 8. Each one only ever fires once because a
// child's health is reset on the way out of _splitBoss.
export const SCHISM_SPLITS = [0.5, 0.25, 0.12];

export function aiSchism(e, a) {
  const bs = e.bs;
  // TWO separate guards, and they must stay separate: _splitBoss hands a child
  // its parent's `tier` at birth, so a tier test would leave every child with
  // an undefined burst clock - which decrements to NaN and silently never
  // fires. The split halves are exactly the parts the volley matters most on.
  if (bs.tier === undefined) bs.tier = 0;
  if (bs.burstCd === undefined) {
    // Randomised so the parts of a split boss never fire together.
    bs.burstCd = 1.5 + Math.random() * SCHISM_BURST_CD;
    bs.tell = 0;
  }
  aiMelee(e, a);
  e.coreMesh.rotation.y += a.dt * 2.5;
  e.ringMesh.rotation.x += a.dt * 1.8;

  if (bs.tell > 0) {
    bs.tell -= a.dt;
    // The wind-up IS the core spinning up and swelling - no extra geometry and
    // nothing to clean up if the part dies mid-tell.
    e.coreMesh.rotation.y += a.dt * 9;
    const k = 1 + (1 - Math.max(0, bs.tell) / SCHISM_TELL) * 0.7;
    e.ringMesh.scale.setScalar(k);
    if (bs.tell <= 0) {
      e.ringMesh.scale.setScalar(1);
      const y = 1.0 * (e.group.scale.y || 1);
      for (let i = 0; i < SCHISM_BURST_SHOTS; i++) {
        a.ctx.addProjectile(
          e.pos.x, y, e.pos.z, 'schism', 1, (i / SCHISM_BURST_SHOTS) * Math.PI * 2
        );
      }
      _bossAt.set(e.pos.x, y, e.pos.z);
      a.ctx.effects.burst(_bossAt, ENEMY_TYPES.schism.color, 18, 6, 1.5, 0.4);
    }
  } else {
    bs.burstCd -= a.dt;
    if (bs.burstCd <= 0 && a.dist < 26) {
      bs.burstCd = SCHISM_BURST_CD * e.rate + Math.random() * 1.2;
      bs.tell = SCHISM_TELL;
    }
  }

  if (bs.tier < SCHISM_SPLITS.length && e.hp <= e.maxHp * SCHISM_SPLITS[bs.tier]) {
    bs.tier++;
    a.ctx.bossEvent('split', e);
  }
}

const TYPES = {
  splitter: {
    head: { r: 0.3, y: 1.12 },
    hp: 30, speed: 3.0, damage: 10, value: 120, color: SPLITTER_BODY, eye: SPLITTER_EYE,
    scale: 1.0, radius: 0.5, mass: 1,
    melee: { windup: 0.4, start: 1.4, hit: 2.0, cd: 1.0 },
    build: buildSplitter, ai: aiSplitter,
  },

  // ---- PLAGUE -------------------------------------------------------------
  //
  // The theme of things that are NOT FINISHED WHEN THEY DIE. A splitter breaks
  // into three, a husk bursts, a vitriol's cloud outlives the throw - and the
  // three added here carry the same idea into the other roles: a round that
  // rots the floor whether or not it hit, a body that gets back up, and a sack
  // that is more dangerous as a corpse than as an enemy.
  //
  // SO IT IS THE THEME WHERE CLEARING THE ROOM IS THE MISTAKE. Every other
  // theme rewards killing things in front of you; this one charges for it, and
  // the question it asks is not what to kill but what order and where.
  //
  // THE SHARED SILHOUETTE IS THE SPLIT SEAM. Every body is a bloated mass with
  // a hard rind that has burst open somewhere - a crack down the middle, a lid
  // lifted off, a flank hanging loose - and something soft showing through.
  // Where BRINE is grown over, PLAGUE is SPLITTING.

  // Burst fire that rots the floor WHEREVER IT LANDS. A round that misses
  // leaves a puddle exactly like a round that hits, so the ground behind the
  // player fills up with the shots they dodged.
  //
  // The only gunner in the game whose misses cost the player anything, which
  // makes it the one that cannot be beaten by movement alone - strafing a
  // lesion writes a wall of poison across the arc you strafed through, and the
  // way out is to kill it or to break the angle rather than to keep moving.
  lesion: {
    head: { r: 0.3, y: 1.12 },
    hp: 26, speed: 2.3, damage: 8, value: 270, color: 0xb3327a, eye: 0xffb0e8,
    scale: 1.0, radius: 0.48, mass: 1,
    orbit: { dist: 12, band: 2.5, out: 0.8, in: -0.65, strafe: 0.45, flip: 1.8, flipVar: 2 },
    proj: {
      core: 0xffb0e8, glow: 0xcc3d8a, scale: 0.6,
      speed: [17, 0.3, 25], dmg: [7, 0.35, 13],
      // WHAT IT LEAVES. Read by _updateProjectiles when the round stops, on a
      // wall or on the player alike - the whole enemy is in this one row.
      leave: { kind: 'bile', radius: 1.5, life: 4.5, dps: 7 },
    },
    build: buildLesion, ai: aiLesion,
  },

  // No attack. It RAISES one enemy that dies near it, once each, at a fraction
  // of the health it had - so a wave cleared in front of a carrion is a wave
  // that gets back up behind the player.
  //
  // The support that makes killing things WRONG. A conduit makes the crowd
  // tougher, a warden makes it unkillable and a capacitor makes it cost more;
  // this one makes the act of clearing the room the thing that feeds it, and
  // the only answer is to find it first - which is the same answer as always,
  // arrived at from the opposite direction.
  carrion: {
    head: { r: 0.3, y: 1.6 },
    hp: 66, speed: 2.0, damage: 0, value: 350, color: 0x8f2f68, eye: 0xffb0e8,
    scale: 1.2, radius: 0.52, mass: 1,
    orbit: { dist: 13, band: 2.5, out: 0.8, in: -0.6, strafe: 0.3, flip: 2, flipVar: 2 },
    build: buildCarrion, ai: aiCarrion,
  },

  // A slow airborne sack. It does no damage at all in the air, dives onto the
  // ground the player is standing on, and BURSTS - a cloud of gas over
  // wherever it came down, whether that was where it was aimed or not.
  //
  // The husk's argument in the air, and the difference is who chooses the
  // ground: a husk bursts where the player decided to fight it, and a bloatfly
  // bursts where the player was standing two seconds ago. Between them the
  // theme charges for both standing still and for having stood still.
  bloatfly: {
    head: { r: 0.3, y: 0.9 },
    hp: 60, speed: 3.2, damage: 0, value: 300, color: 0x9c3a86, eye: 0xffb0e8,
    scale: 1.15, radius: 0.5, mass: 1,
    fly: { height: 3.4 },
    hitbox: { r: 0.64, y: 0.55 },
    // It bursts however it dies, which is the point: shooting it out of the
    // air over your own head is a decision, not a free kill.
    onDeath: (e, ctx) => {
      ctx.addHazard(e.pos.x, e.pos.z, BLOAT_CLOUD_R, BLOAT_CLOUD_LIFE, GAS_DPS, 'gas');
      if (ctx.effects) {
        _plagueAt.set(e.pos.x, Math.max(0.6, e.pos.y), e.pos.z);
        ctx.effects.burst(_plagueAt, 0xffb0e8, 28, 5, 2.4, 0.8);
      }
    },
    build: buildBloatfly, ai: aiBloatfly,
  },

  // Punishes killing it where you are standing. A slow, heavy sack that fights
  // like a bad tank and BURSTS when it dies, leaving a cloud of gas over its
  // own corpse - which, since it had to be killed at some point, is a cloud
  // over wherever the player chose to fight it.
  //
  // The whole enemy is one decision the player did not know they were making:
  // a brute invites you to stand and shoot, and this is the one that charges
  // you for it. Killing it at range, or moving after it dies, costs nothing.
  husk: {
    head: { r: 0.32, y: 1.6 },
    hp: 130, speed: 1.5, damage: 14, value: 300, color: 0xa03a72, eye: 0xffb0e8,
    scale: 1.4, radius: 0.6, mass: 2,
    melee: { windup: 0.8, start: 2.8, hit: 3.4, cd: 2.4 },
    onDeath: (e, ctx) => {
      ctx.addHazard(e.pos.x, e.pos.z, HUSK_CLOUD_RADIUS, HUSK_CLOUD_LIFE, GAS_DPS, 'gas');
      if (ctx.effects) {
        _blinkAt.set(e.pos.x, 0.9, e.pos.z);
        ctx.effects.burst(_blinkAt, ENEMY_TYPES.husk.eye, 26, 4, 2.2, 0.8);
      }
    },
    build: buildHusk, ai: aiMelee,
  },

  // The blight's other half. A blight makes the ground you are standing on
  // cost health while you stand on it; a vitriol throws a cloud that keeps
  // costing after you are out of it. Same lob, same lead, same tell - what is
  // different is that running through this one is not free.
  //
  // It does no direct damage at all, exactly like the blight: what it throws
  // is the entire enemy.
  vitriol: {
    head: { r: 0.3, y: 0.56 },
    hp: 46, speed: 1.9, damage: 0, value: 260, color: 0x9c3a86, eye: 0xffb0e8,
    scale: 1.12, radius: 0.55, mass: 1,
    orbit: { dist: 12, band: 2, out: 0.7, in: -0.5, strafe: 0.3, flip: 2.5, flipVar: 2 },
    // The canister, in the gas's own green rather than the blight's acid
    // yellow-green. The two lobs have to be told apart IN THE AIR - one is
    // ground to step off and the other is a cloud to not be in - and the
    // colour is the only thing available while it is still flying.
    proj: { core: 0xd6ffb0, glow: 0x4fe06a, scale: 1.4 },
    build: buildVitriol, ai: aiVitriol,
  },

  // Splits at half health and again at a quarter, one into two into four. The
  // health here is HALF the fight's pool: the player deals 0.5H to force the
  // first split, 0.5H for the second and a full H to finish the four, so
  // clearing it costs 2x this number. See the sanity check in waves.js.
  schism: {
    head: { r: 0.42, y: 1.3 },
    hp: 1550, speed: 3.0, damage: 18, value: 6000, color: 0xd500f9, eye: 0xffb0ff,
    scale: 2.2, radius: 1.3, mass: 5, boss: true,
    hitbox: { r: 0.7, y: 0.8 },
    statusMul: 0.35, freezeSlow: true, slowFactor: 0.75, freezeVuln: 1.0,
    entropyExempt: true, fearMode: 'stagger',
    melee: { windup: 0.55, start: 2.6, hit: 3.2, cd: 1.6 },
    // The radial volley, in the boss's own violet. Eight are in the air at
    // once, so they are small and each is cheap: a fan of shooter-sized rounds
    // reads as a wall with no gap to move through, and the volley has to cost
    // real health when it catches you in the open while staying survivable
    // when one round clips you on the way past.
    proj: {
      core: 0xffb0ff, glow: 0xd500f9, scale: 0.6,
      speed: [13, 0.22, 19], dmg: [7, 0.3, 14],
    },
    build: buildSchism, ai: aiSchism,
  },
};

Object.assign(ENEMY_TYPES, TYPES);
