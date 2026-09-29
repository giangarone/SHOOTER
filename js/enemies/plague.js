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
  _bossAt, aiMelee, bossTouch, eyes, geo, lump, orbit, partsFor, prism,
  releaseMarks, segBlocked, shard, slab, snapAim, faceSnap, spike,
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

// ---- the PLAGUE boss -------------------------------------------------------
// The theme's language carries over whole: A BLOATED MASS, BURST OPEN. Two
// split halves with a wound of light between them, a keel it slides on, and -
// the rework's addition - a pair of SOFT SACS slung in the seam. The sacs are
// the tell: they swell before anything the fight is about to do with its rot
// (the nova, the rain), which is the same read the husk and the bloatfly
// already taught.
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
  // THE SACS. In the family's own gas green, out past the body between the
  // halves: the reservoir the nova and the spore rain visibly draw on.
  e.sacs = [
    P('schismSac', lump(0.15), { x: -0.24, y: 1.24, z: -0.14, mat: SHARED_MATS.huskSac, shadow: false }),
    P('schismSac', lump(0.15), { x: 0.24, y: 1.24, z: -0.14, mat: SHARED_MATS.huskSac, shadow: false }),
  ];
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
  if (a.dist > BLOAT_DROP_R || e.pos.y < 1.5) return;
  e.diving = true;
  e.flash = 0.2;
  e._setEyeAlert(true);
  if (ctx.effects) {
    _plagueAt.set(e.pos.x, 0.3, e.pos.z);
    ctx.effects.shockwave(_plagueAt, 0xcc3d8a, BLOAT_CLOUD_R, 0.5);
  }
}

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

// SCHISM, the theme's argument at boss size: NOTHING HERE IS FINISHED WHEN IT
// DIES. Not the boss - it splits, three times over - not its shots, which rot
// whatever they pass over, and not the wave's dead, which its toll stands
// back up. The old fight was a walking health bar with one volley; it is now
// a MOBILE disease that asks a different question every few seconds.
//
// THE SIX THINGS IT DOES, and what each one asks of the player:
//
//   SICK BURST   the kept signature: a wind-up, then eight rounds on every
//                bearing, alternating a half-step between volleys so
//                back-to-back ones interleave. Be behind something.
//                (test/boss.mjs counts exactly the eight and the tell before
//                them - both stay.)
//   RUPTURE      it plants and three corridors of floor light up THROUGH the
//                bearing you were on when it committed - then they blow, and
//                stay rotten. Move ACROSS, not away; a jump clears what a
//                late sidestep missed.
//   SPORE RAIN   four gas globs, each re-led at your CURRENT position a
//                breath apart. Range is not safety; changing direction is.
//   BROOD LUNGE  a chained pounce, two or three hops, each down a marked
//                corridor, each landing in a burst of the husk's gas. The
//                fight moving around the arena instead of holding a corner.
//   LAST RITES   it plants and tolls a wide ring: while the ring stands,
//                anything that DIES near it is raised where it fell, at the
//                carrion's fraction. The theme's sin - clearing the room -
//                made into an explicit order: shoot the boss, not the crowd.
//   PESTILENT NOVA
//                the anti-hug. The sacs swell, the floor under it marks, and
//                it blows - a point-blank burst and a standing ring of rot.
//
// And TOUCHING it hurts at all times. The wind-up swing is gone; the body
// runs on a contact clock in every state, so walking through the boss is
// never the shortcut it used to be. No shield and no bigger bar anywhere in
// this: the escalation is frequency and movement, and it is all PER PART -
// the eight dying pieces each still cast, which was always the design.

export const SCHISM_BURST_CD = 3.1;

export const SCHISM_BURST_SHOTS = 8;

// Seconds the core flares before the rounds leave. The volley covers every
// bearing, so it cannot be dodged by direction - only by reading it early and
// getting something between you and it.
export const SCHISM_TELL = 0.45;

// Split thresholds, in fractions of the part's own health pool. THREE of them:
// 2 parts, then 4, then 8. Each one only ever fires once because a child's
// health is reset on the way out of _splitBoss.
export const SCHISM_SPLITS = [0.5, 0.25, 0.12];

// Prowl distance per tier: the whole body holds midrange, and the pieces
// CLOSE as they come apart - the little ones are in your space.
const SCHISM_PROWL_DIST = [6.5, 5, 3.8, 3.2];

// NOVA - the point-blank pustule burst. The cap is what a boss in this house
// pays for a committed melee answer; the radius makes "adjacent" cost, and
// the ring of bile it leaves makes STAYING adjacent cost more.
const NOVA_CD = 7.5;
const NOVA_TELL = 0.7;
const NOVA_RANGE = 4.8;   // cast only once the player has come inside this
const NOVA_RADIUS = 4.6;
const NOVA_CAP = 34;
const NOVA_MUL = 1.3;
const NOVA_BILE = 6;      // a closed ring of rot at this radius around it
const NOVA_BILE_R = 3.4;

// RUPTURE - the seam rips open along a captured bearing, three corridors.
// Lane marks rather than mortar circles: the corridor IS the warning, and
// there are only three of them so the mark pool holds them all up front.
const RUPTURE_CD = 6.5;
const RUPTURE_TELL = 0.85;
const RUPTURE_LEN = 9.0;
const RUPTURE_HALF = 0.95;
const RUPTURE_ARC = 0.58;
const RUPTURE_CAP = 30;
const RUPTURE_DEPTHS = [2.3, 5, 7.7];   // where the bile it spills lands

// BROOD LUNGE - the chained pounce. Committed to a bearing like every
// telegraph in this game; the next hop re-aims, so the sidestep is answered,
// not wasted. The speed multiple clears the step clamp, making the lunge the
// one movement in the theme allowed to outrun the player for a moment.
const LUNGE_CD = 9.0;
const LUNGE_MIN = 6.0;    // never cast point-blank - the nova answers that
const LUNGE_TELL = 0.55;
const LUNGE_CHAIN_TELL = 0.42;
const LUNGE_TIME = 1.1;
const LUNGE_MUL = 3.3;
const LUNGE_HALF = 1.0;
const LUNGE_OVERSHOOT = 3.5;
const LUNGE_HIT_R = 2.8;
const LUNGE_CAP = 30;

// SPORE RAIN - a walking mortar of gas globs, each led at the player's feet
// the moment it leaves. Four in under a second; then the floor is clouds.
const RAIN_CD = 7.0;
const RAIN_MIN = 8.0;
const RAIN_TELL = 0.7;
const RAIN_SHOTS = 4;
const RAIN_GAP = 0.22;

// LAST RITES - the toll. Long enough to read, wide enough to matter, and the
// answer is to stop shooting the crowd for the length of it.
const TOLL_CD = 14;
const TOLL_TIME = 2.4;
const TOLL_RANGE = 12;
const TOLL_HP = 0.35;
const TOLL_MAX_TIER = 1;  // big bodies only - eight parts tolling is noise

// The volley may only BEGIN in these states; a tell already running always
// finishes. One loud tell at a time is the readability rule.
const SCHISM_VOLLEY_STATES = new Set(['prowl', 'recover', 'rain', 'toll']);

// A cooldown, scaled: later pieces cast a little less often each - eight
// parts at full rate would be a wall of overlapping tells - and a part under
// half its own bar presses HARDER, so wounding the fight never makes it safe.
function schismCd(e, base) {
  const bs = e.bs;
  return base * (1 + bs.tier * 0.25) * (e.hp <= e.maxHp * 0.5 ? 0.75 : 1) * e.rate;
}

// The pose is rewritten from scratch every frame, so a state only has to say
// what it wants THIS frame, and leaving one puts the body back on its own.
function schismPose(e) {
  const bs = e.bs;
  const b = bs.baseScale || 1;
  e.group.scale.set(b, b, b);
  e.group.rotation.x = 0;
  if (e.sacs) for (const s of e.sacs) s.scale.setScalar(e.scale);
  e.coreMesh.scale.setScalar(e.scale);
}

// Interrupted - feared, or re-flowed by a test. Every telegraph the boss can
// be holding lives in bs.mark / bs.rings under bs.fx, which is exactly the
// shape releaseMarks() releases; the pose goes back with it.
function schismAbort(e) {
  releaseMarks(e);
  schismPose(e);
  e._setEyeAlert(false);
  e.stepMul = 1.4;
}

// A death calls the same release (Enemy.release()); a fear calls schismAbort.
function cleanupSchism(e) {
  releaseMarks(e);
}

// THE BURST CHANNEL. Runs in every state - per-part pressure never fully
// stops - but a new volley only BEGINS where it cannot talk over a louder
// tell. Fired by every part, offsets alternating so back-to-back volleys
// interleave instead of landing as one wall.
function tickSchismBurst(e, a) {
  const bs = e.bs;
  if (bs.tell > 0) {
    bs.tell -= a.dt;
    // The wind-up IS the core spinning up and the seam swelling - no extra
    // geometry and nothing to clean up if the part dies mid-tell.
    e.coreMesh.rotation.y += a.dt * 9;
    e.ringMesh.scale.setScalar(1 + (1 - Math.max(0, bs.tell) / SCHISM_TELL) * 0.7);
    if (bs.tell > 0) return;
    e.ringMesh.scale.setScalar(1);
    const y = 1.0 * (e.group.scale.y || 1);
    const bias = (bs.spin++ % 2) * (Math.PI / SCHISM_BURST_SHOTS);
    for (let i = 0; i < SCHISM_BURST_SHOTS; i++) {
      a.ctx.addProjectile(
        e.pos.x, y, e.pos.z, 'schism', e._projScale(),
        bias + (i / SCHISM_BURST_SHOTS) * Math.PI * 2
      );
    }
    _bossAt.set(e.pos.x, y, e.pos.z);
    a.ctx.effects.burst(_bossAt, ENEMY_TYPES.schism.color, 18, 6, 1.5, 0.4);
    if (a.ctx.sfx) a.ctx.sfx.impact();
    return;
  }
  bs.burstCd -= a.dt;
  if (bs.burstCd > 0 || a.dist >= 26 || !SCHISM_VOLLEY_STATES.has(bs.state)) return;
  bs.burstCd = SCHISM_BURST_CD * e.rate + Math.random() * 1.2;
  bs.tell = SCHISM_TELL;
}

// ---- the five casts --------------------------------------------------------

function schismCastNova(e, a) {
  const bs = e.bs;
  bs.state = 'novaTell';
  bs.t = bs.tMax = NOVA_TELL;
  bs.fx = a.ctx.effects;
  if (!(bs.mark >= 0)) bs.mark = a.ctx.effects.markAcquire();
  e._setEyeAlert(true);
}

function schismNovaFire(e, a) {
  const bs = e.bs;
  const ctx = a.ctx;
  if (bs.fx && bs.mark >= 0) bs.fx.markRelease(bs.mark);
  bs.mark = -1;
  _bossAt.set(e.pos.x, 1.2, e.pos.z);
  ctx.effects.shockwave(_bossAt, ENEMY_TYPES.schism.color, NOVA_RADIUS, 0.5);
  ctx.effects.burst(_bossAt, 0x8fbf4a, 26, 6, 2.5, 0.6);
  ctx.effects.burst(_bossAt, ENEMY_TYPES.schism.eye, 16, 4, 2, 0.5);
  ctx.effects.addShake(0.22);
  if (ctx.sfx) ctx.sfx.impact();
  // Point-blank and JUMPABLE: the ring on the floor was the warning, and a
  // hop over the rim is as good an answer as the step back was.
  const p = ctx.player.pos;
  const d = Math.hypot(p.x - e.pos.x, p.z - e.pos.z);
  if (d < NOVA_RADIUS && Math.abs(p.y - e.pos.y) < 1.5 &&
      !segBlocked(e.pos.x, e.pos.y + 1.5, e.pos.z, p.x, p.y + 0.8, p.z, ctx.obstacles)) {
    ctx.onHitPlayer(
      Math.min(NOVA_CAP, e.damage * NOVA_MUL * (1 - 0.45 * d / NOVA_RADIUS)), e.pos, e
    );
  }
  // And the ground around it STAYS rotten - the lesion's own brew, in a
  // closed ring: hugging the boss has a price that outlives the burst.
  for (let i = 0; i < NOVA_BILE; i++) {
    const ang = (i / NOVA_BILE) * Math.PI * 2;
    ctx.addHazard(
      e.pos.x + Math.cos(ang) * NOVA_BILE_R, e.pos.z + Math.sin(ang) * NOVA_BILE_R,
      1.5, 4.5, 7, 'bile'
    );
  }
  bs.state = 'recover';
  bs.t = bs.tMax = 0.65 * e.rate;
  bs.cdNova = schismCd(e, NOVA_CD);
  e._setEyeAlert(false);
}

function schismCastRupture(e, a) {
  const bs = e.bs;
  bs.state = 'ruptureTell';
  bs.t = bs.tMax = RUPTURE_TELL;
  snapAim(e, a, true);
  faceSnap(e);
  bs.fx = a.ctx.effects;
  // Three corridors: the captured bearing and one each side, marks acquired
  // UP FRONT. A lane the pool could not mark is SKIPPED - an impact whose
  // warning nobody saw is the one thing a telegraph may never be.
  bs.rings = [];
  for (const off of [-RUPTURE_ARC, 0, RUPTURE_ARC]) {
    const h = a.ctx.effects.markAcquire();
    if (h < 0) continue;
    const ang = e.aim + off;
    bs.rings.push({ mark: h, dx: Math.cos(ang), dz: Math.sin(ang) });
  }
}

function schismRuptureFire(e, a) {
  const bs = e.bs;
  const ctx = a.ctx;
  const p = ctx.player.pos;
  for (const r of bs.rings) {
    // The corridor goes off as one for the HIT; the rot it spills lands at
    // three depths and stays - the subject of the sentence is the floor.
    for (const dd of RUPTURE_DEPTHS) {
      _bossAt.set(e.pos.x + r.dx * dd, 0.1, e.pos.z + r.dz * dd);
      ctx.effects.burst(_bossAt, 0x8fbf4a, 10, 3.5, 2.2, 0.45);
      ctx.addHazard(_bossAt.x, _bossAt.z, 1.35, 4, 7, 'bile');
    }
    _bossAt.set(e.pos.x + r.dx * RUPTURE_LEN / 2, 0.2, e.pos.z + r.dz * RUPTURE_LEN / 2);
    ctx.effects.shockwave(_bossAt, ENEMY_TYPES.schism.color, RUPTURE_HALF * 1.7, 0.35);
    const rx = p.x - e.pos.x;
    const rz = p.z - e.pos.z;
    const along = rx * r.dx + rz * r.dz;
    const cross = Math.abs(-rx * r.dz + rz * r.dx);
    if (along > 0.4 && along < RUPTURE_LEN && cross < RUPTURE_HALF + 0.35 &&
        Math.abs(p.y - e.pos.y) < 1.5 &&
        !segBlocked(e.pos.x, e.pos.y + 0.5, e.pos.z, p.x, p.y + 0.8, p.z, ctx.obstacles)) {
      ctx.onHitPlayer(
        Math.min(RUPTURE_CAP, e.damage * 1.15 * (1 - 0.4 * cross / RUPTURE_HALF)), e.pos, e
      );
    }
    if (r.mark >= 0) bs.fx.markRelease(r.mark);
  }
  bs.rings.length = 0;
  ctx.effects.addShake(0.16);
  if (ctx.sfx) ctx.sfx.impact();
  bs.state = 'recover';
  bs.t = bs.tMax = 0.55 * e.rate;
  bs.cdRupture = schismCd(e, RUPTURE_CD);
  e._setEyeAlert(false);
}

function schismCastLunge(e, a, first) {
  const bs = e.bs;
  bs.state = 'lungeTell';
  bs.t = bs.tMax = first ? LUNGE_TELL : LUNGE_CHAIN_TELL;
  snapAim(e, a, true);
  bs.lx = e.nx;
  bs.lz = e.nz;
  // The corridor covers the jump TO plus the body past it: the mark is the
  // contract - it crosses the room, and whatever is on the line is its
  // problem. Clamped so a long dive still shows as one corridor.
  bs.lungeLen = Math.min(a.dist + LUNGE_OVERSHOOT, 17);
  bs.fx = a.ctx.effects;
  if (!(bs.mark >= 0)) bs.mark = a.ctx.effects.markAcquire();
  if (first) bs.lungeN = 2 + (e.hp <= e.maxHp * 0.5 ? 1 : 0);
}

function schismLungeLand(e, a) {
  const bs = e.bs;
  const ctx = a.ctx;
  // Wherever it stopped - the mark or the wall - the sacs under it burst:
  // the husk's lesson at engine speed.
  _bossAt.set(e.pos.x, 0.3, e.pos.z);
  ctx.effects.shockwave(_bossAt, 0x4fe06a, 3, 0.4);
  ctx.effects.burst(_bossAt, 0x8fbf4a, 18, 5, 2.5, 0.5);
  ctx.effects.addShake(0.2);
  if (ctx.sfx) ctx.sfx.impact();
  ctx.addHazard(e.pos.x, e.pos.z, 2.5, 4, GAS_DPS, 'gas');
  const p = ctx.player.pos;
  const d = Math.hypot(p.x - e.pos.x, p.z - e.pos.z);
  if (d < LUNGE_HIT_R && Math.abs(p.y - e.pos.y) < 2.4 &&
      !segBlocked(e.pos.x, 0.5, e.pos.z, p.x, p.y + 0.8, p.z, ctx.obstacles)) {
    ctx.onHitPlayer(
      Math.min(LUNGE_CAP, e.damage * 1.15 * (1 - 0.4 * d / LUNGE_HIT_R)), e.pos, e
    );
  }
  bs.lungeN--;
  if (bs.lungeN > 0) {
    // Straight back into the next hop, re-aimed at wherever the player went.
    schismCastLunge(e, a, false);
    return;
  }
  bs.state = 'recover';
  // The pant after the chain is the greed window - deliberately long enough
  // to be taken, so a player who saved their sprint eats the pause instead.
  bs.t = bs.tMax = 0.9 * e.rate;
  bs.cdLunge = schismCd(e, LUNGE_CD);
  e._setEyeAlert(false);
}

function schismCastRain(e, a) {
  const bs = e.bs;
  bs.state = 'rainTell';
  bs.t = bs.tMax = RAIN_TELL;
  e._setEyeAlert(true);
}

function schismCastToll(e, a) {
  const bs = e.bs;
  bs.state = 'toll';
  bs.t = bs.tMax = TOLL_TIME;
  bs.fx = a.ctx.effects;
  if (!(bs.mark >= 0)) bs.mark = a.ctx.effects.markAcquire();
  e._setEyeAlert(true);
  if (a.ctx.sfx) a.ctx.sfx.wave();
}

export function aiSchism(e, a) {
  const bs = e.bs;
  const ctx = a.ctx;
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
  if (bs.state === undefined) {
    bs.state = 'prowl';
    bs.t = bs.tMax = 0.5 + Math.random() * 0.7;
    bs.mark = -1;
    bs.rings = [];
    bs.cdNova = 3.5;
    bs.cdRain = 2 + Math.random() * 1.5;
    bs.cdRupture = 1.6 + Math.random();
    bs.cdLunge = 4 + Math.random() * 2;
    bs.cdToll = 8;
    bs.spin = 0;
    bs.lungeN = 0;
    bs.baseScale = e.group.scale.x;
  }

  const dt = a.dt;
  e.stepMul = 1.4;
  schismPose(e);

  // The split is checked BEFORE the states on purpose: a part mid-tell when
  // the threshold goes dies into its children on this frame, and the children
  // are not bound by the parent's interrupted tell.
  if (bs.tier < SCHISM_SPLITS.length && e.hp <= e.maxHp * SCHISM_SPLITS[bs.tier]) {
    bs.tier++;
    ctx.bossEvent('split', e);
    return;
  }

  // Feared: 'stagger' bosses hold position instead of running, and this one
  // also cancels whatever it was telling. Touch STILL hurts - see below.
  if (e.status.fear > 0) {
    schismAbort(e);
    bs.state = 'recover';
    bs.t = bs.tMax = 0.4;
    a.vx = 0;
    a.vz = 0;
    bossTouch(e, a);
    return;
  }

  // TOUCHING IT HURTS, in every state, on its own clock. This replaces the
  // old wind-up swing: the body itself is the melee attack now.
  bossTouch(e, a);

  tickSchismBurst(e, a);

  bs.cdNova -= dt;
  bs.cdRain -= dt;
  bs.cdRupture -= dt;
  bs.cdLunge -= dt;
  bs.cdToll -= dt;
  bs.t -= dt;

  e.coreMesh.rotation.y += dt * 2.5;
  e.ringMesh.rotation.x += dt * 1.8;

  if (bs.state === 'prowl') {
    // Stalk: hold a ring around the player and weave, so even its quietest
    // state is closing. `px/pz` is the nav heading around cover; the weave
    // rides on top so it never reads as a train on rails.
    const want = SCHISM_PROWL_DIST[Math.min(bs.tier, 3)];
    e.strafeT -= dt;
    if (e.strafeT <= 0) {
      e.strafe *= -1;
      e.strafeT = 1 + Math.random() * 1.6;
    }
    const along = a.dist > want + 1 ? 1 : a.dist < want - 1 ? -0.5 : 0.1;
    a.vx = a.px * a.sp * along + -a.pz * e.strafe * a.sp * 0.4;
    a.vz = a.pz * a.sp * along + a.px * e.strafe * a.sp * 0.4;
    if (bs.t > 0) return;
    // The picker, most-local question first. Anything unanswered hands a
    // fresh think in under half a second, so the fight never goes quiet.
    if (a.dist < NOVA_RANGE && bs.cdNova <= 0) { schismCastNova(e, a); return; }
    if (bs.tier <= TOLL_MAX_TIER && bs.cdToll <= 0) { schismCastToll(e, a); return; }
    if (a.dist >= LUNGE_MIN && bs.cdLunge <= 0) { schismCastLunge(e, a, true); return; }
    if (a.dist >= RAIN_MIN && bs.cdRain <= 0) { schismCastRain(e, a); return; }
    if (a.dist < RUPTURE_LEN && bs.cdRupture <= 0) { schismCastRupture(e, a); return; }
    bs.t = 0.3 * e.rate + Math.random() * 0.2;
    return;
  }

  if (bs.state === 'novaTell') {
    a.vx = 0;
    a.vz = 0;
    const fill = 1 - Math.max(0, bs.t) / bs.tMax;
    const b = bs.baseScale || 1;
    e.group.scale.set(b * (1 + fill * 0.1), b * (1 + fill * 0.06), b * (1 + fill * 0.1));
    // The sacs ARE the read - the family's soft thing showing through.
    for (const s of e.sacs) s.scale.setScalar(e.scale * (1 + fill * 0.9));
    e.coreMesh.scale.setScalar(e.scale * (1 + fill * 0.35));
    bs.fx.markSet(bs.mark, e.pos.x, e.pos.z, NOVA_RADIUS, ENEMY_TYPES.schism.color, fill, 1, 0, 0.55);
    if (bs.t > 0) return;
    schismNovaFire(e, a);
    return;
  }

  if (bs.state === 'ruptureTell') {
    a.vx = 0;
    a.vz = 0;
    faceSnap(e);
    const fill = 1 - Math.max(0, bs.t) / bs.tMax;
    const b = bs.baseScale || 1;
    e.group.scale.set(b * 1.06, b * 0.88, b * 1.06);
    for (const s of e.sacs) s.scale.setScalar(e.scale * (1 + fill * 0.5));
    for (const r of bs.rings) {
      bs.fx.markSet(
        r.mark, e.pos.x + r.dx * RUPTURE_LEN / 2, e.pos.z + r.dz * RUPTURE_LEN / 2,
        RUPTURE_HALF, ENEMY_TYPES.schism.color, fill,
        RUPTURE_LEN / (RUPTURE_HALF * 2), Math.atan2(-r.dx, -r.dz)
      );
    }
    if (bs.t > 0) return;
    schismRuptureFire(e, a);
    return;
  }

  if (bs.state === 'lungeTell') {
    a.vx = 0;
    a.vz = 0;
    const fill = 1 - Math.max(0, bs.t) / bs.tMax;
    const b = bs.baseScale || 1;
    e.group.scale.set(b * 1.08, b * 0.85, b * 0.92);
    e.group.rotation.x = -0.22 * fill;
    bs.fx.markSet(bs.mark, e.pos.x + bs.lx * bs.lungeLen / 2, e.pos.z + bs.lz * bs.lungeLen / 2,
      LUNGE_HALF, ENEMY_TYPES.schism.color, fill,
      bs.lungeLen / (LUNGE_HALF * 2), Math.atan2(-bs.lx, -bs.lz));
    if (bs.t > 0) return;
    if (bs.fx && bs.mark >= 0) bs.fx.markRelease(bs.mark);
    bs.mark = -1;
    bs.state = 'lunge';
    bs.t = bs.tMax = LUNGE_TIME;
    // Where the hop started, so the stop test is distance ALONG the corridor.
    bs.lfx = e.pos.x;
    bs.lfz = e.pos.z;
    return;
  }

  if (bs.state === 'lunge') {
    e.stepMul = LUNGE_MUL;
    a.vx = bs.lx * a.sp * LUNGE_MUL;
    a.vz = bs.lz * a.sp * LUNGE_MUL;
    e.faceLocked = true;
    e.group.rotation.y = Math.atan2(-bs.lx, -bs.lz);
    const b = bs.baseScale || 1;
    e.group.scale.set(b * 0.94, b * 0.94, b * 1.12);
    const gone = (e.pos.x - bs.lfx) * bs.lx + (e.pos.z - bs.lfz) * bs.lz;
    // Blockage only counts as a slam once the hop has actually gone somewhere:
    // a boss resting against a crate starts the frame with blockedBy > 0 and
    // a lunge that ended on THAT would be a toe-stub fake-out, not a land.
    if (gone < bs.lungeLen - 1.2 && bs.t > 0 && !(gone > 0.3 && e.blockedBy > 0.05)) return;
    schismLungeLand(e, a);
    return;
  }

  if (bs.state === 'rainTell') {
    // It keeps shuffling closer at a fifth speed - the rain is not a reason
    // to stop arriving.
    a.vx = a.px * a.sp * 0.2;
    a.vz = a.pz * a.sp * 0.2;
    const fill = 1 - Math.max(0, bs.t) / bs.tMax;
    e.group.rotation.x = 0.22 * fill;
    for (const s of e.sacs) s.scale.setScalar(e.scale * (1 + fill * 0.8));
    if (bs.t > 0) return;
    bs.state = 'rain';
    bs.rainN = RAIN_SHOTS;
    bs.rainT = 0;
    return;
  }

  if (bs.state === 'rain') {
    a.vx = a.px * a.sp * 0.2;
    a.vz = a.pz * a.sp * 0.2;
    bs.rainT -= dt;
    if (bs.rainT > 0) return;
    if (bs.rainN <= 0) {
      bs.state = 'recover';
      bs.t = bs.tMax = 0.5 * e.rate;
      bs.cdRain = schismCd(e, RAIN_CD);
      e._setEyeAlert(false);
      return;
    }
    bs.rainT = RAIN_GAP;
    bs.rainN--;
    // Each glob leads the player's CURRENT position at its own release, a
    // breath apart: the salvo walks across where you were ABOUT to keep
    // going, and standing still inside it is the one losing move.
    const y = 1.3 * (bs.baseScale || 1);
    ctx.addSpit(e.pos.x + a.nx * 0.9, y, e.pos.z + a.nz * 0.9, 'gas');
    _bossAt.set(e.pos.x + a.nx * 0.9, y, e.pos.z + a.nz * 0.9);
    ctx.effects.burst(_bossAt, 0x8fbf4a, 8, 2.5, 2, 0.35);
    // The reservoir visibly spends as it throws.
    for (const s of e.sacs) s.scale.setScalar(e.scale * (1 + bs.rainN * 0.2));
    return;
  }

  if (bs.state === 'toll') {
    a.vx = 0;
    a.vz = 0;
    const fill = 1 - Math.max(0, bs.t) / bs.tMax;
    const b = bs.baseScale || 1;
    e.group.scale.set(b * 1.04, b * 0.9, b * 1.04);
    e.coreMesh.scale.setScalar(e.scale * (1.3 + Math.sin(bs.t * 9) * 0.15));
    bs.fx.markSet(bs.mark, e.pos.x, e.pos.z, TOLL_RANGE, ENEMY_TYPES.schism.color,
      fill, 1, 0, 0.35);
    // THE TOLL. While the ring stands, whatever dies inside it gets back up
    // where it fell - each body once, at the carrion's fraction, marked so no
    // toll can ever raise the same corpse twice. The answer is to keep
    // shooting the boss and STOP clearing the crowd.
    for (const o of ctx.enemies) {
      if (!o.dead || o.boss || o.revenant || o.raised) continue;
      if (CARRION_SKIP.has(o.type)) continue;
      const dx = o.pos.x - e.pos.x;
      const dz = o.pos.z - e.pos.z;
      if (dx * dx + dz * dz > TOLL_RANGE * TOLL_RANGE) continue;
      o.raised = true;
      if (ctx.reanimate) ctx.reanimate(o.pos.x, o.pos.z, o.type, TOLL_HP);
      _bossAt.set(o.pos.x, 0.9, o.pos.z);
      ctx.effects.beam(e.pos, _bossAt, 0xcc3d8a);
      ctx.effects.shockwave(_bossAt, 0xcc3d8a, 2.4, 0.4);
      ctx.effects.burst(_bossAt, 0xffb0e8, 14, 4, 2, 0.5);
      if (ctx.sfx) ctx.sfx.impact();
    }
    if (bs.t > 0) return;
    if (bs.fx && bs.mark >= 0) bs.fx.markRelease(bs.mark);
    bs.mark = -1;
    bs.state = 'recover';
    bs.t = bs.tMax = 0.8 * e.rate;
    bs.cdToll = schismCd(e, TOLL_CD);
    e._setEyeAlert(false);
    return;
  }

  // RECOVER. The pant after a commitment: half-speed drift, still touchable,
  // never long enough to be safe in.
  a.vx = a.px * a.sp * 0.35;
  a.vz = a.pz * a.sp * 0.35;
  if (bs.t <= 0) {
    bs.state = 'prowl';
    bs.t = 0.25 + Math.random() * 0.35;
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

  // THE BOSS OF "NOTHING HERE IS FINISHED WHEN IT DIES". Same bar as it
  // always had and no shield - the rework's menace is frequency and
  // movement, and the split ladder still means clearing it costs 2x this
  // number. There is no `melee` row: the wind-up swing is gone, and its
  // contact is the always-on boss touch clock (bossTouch).
  schism: {
    head: { r: 0.42, y: 1.3 },
    hp: 1550, speed: 3.35, damage: 18, value: 6000, color: 0xd500f9, eye: 0xffb0ff,
    scale: 2.2, radius: 1.3, mass: 5, boss: true,
    hitbox: { r: 0.7, y: 0.8 },
    statusMul: 0.35, freezeSlow: true, slowFactor: 0.75, freezeVuln: 1.0,
    entropyExempt: true, fearMode: 'stagger',
    // The radial volley, in the boss's own violet. Eight are in the air at
    // once, so they are small and each is cheap: a fan of shooter-sized rounds
    // reads as a wall with no gap to move through, and the volley has to cost
    // real health when it catches you in the open while staying survivable
    // when one round clips you on the way past.
    proj: {
      core: 0xffb0ff, glow: 0xd500f9, scale: 0.6,
      speed: [13, 0.22, 19], dmg: [7, 0.3, 14],
    },
    build: buildSchism, ai: aiSchism, cleanup: cleanupSchism,
  },
};

Object.assign(ENEMY_TYPES, TYPES);
