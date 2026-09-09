// BRINE's six enemies and its boss.
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
  ENEMY_TYPES, SHARED_MATS, _blinkAt, aiMelee, eyes, geo, lump, orbit,
  partsFor, prism, releaseMarks, segBlocked, shard, slab, spike,
} from './shared.js';

// THE HOWL. Wind-up, radius, how long the player loses the trigger for, and
// how long before it can do it again.
//
// The wind-up is the longest telegraph any non-boss enemy has, and it is long
// on purpose: this is the only attack in the game that takes away the player's
// ability to answer it, so the window to walk out has to be generous enough
// that being caught is a mistake rather than a coin toss.
export const HOWL_WINDUP = 1.3;

// Seven metres, and the howler orbits at six - so it has to be INSIDE its own
// circle's worth of the player to use it, which is what makes "shoot that one"
// a real option rather than advice about something standing across the arena.
// The first pass had both at nine and the ring covered half the floor: a
// telegraph nobody can be outside of is not a telegraph.
export const HOWL_RADIUS = 7;

export const HOWL_FEAR = 2.5;

export const HOWL_CD = 7;

// Support shape - floating, legless, symmetrical - built around a MOUTH that
// faces the player. The first pass hung the jaw underneath the body, which is
// exactly where a player standing at eye height cannot see it: the enemy read
// as an abstract purple crystal and the one thing it needed to say - that it
// is about to open - was pointed at the floor. The mouth is on the front now,
// and the horns are there so the outline is not another cone.
export function buildHowler(e, g, s) {
  const P = partsFor(e, g, s);
  // Cranium: a wide, shallow dome over the mouth rather than a tall bell, so
  // the top half of the silhouette is a brow and not a spire.
  P('howlerSkull', prism(0.2, 0.42, 0.42, 6), { y: 1.5 });
  P('howlerBrow', slab(0.6, 0.1, 0.34), { y: 1.32, z: -0.16 });
  // THE HORNS. Two, long, swept back and out - the whole reason this is not a
  // warden at a glance, and the part that survives at any distance.
  for (const dir of [-1, 1]) {
    P('howlerHorn', spike(0.07, 0.72, 4), {
      x: dir * 0.26, y: 1.62, z: 0.12, rx: 0.85, rz: dir * -0.4,
    });
  }
  // THE THROAT, drawn before the jaw so an open mouth opens onto a hole and
  // not onto the sky behind it.
  P('howlerThroat', prism(0.26, 0.3, 0.34, 6), {
    y: 1.06, z: -0.06, mat: SHARED_MATS.howlerMaw, shadow: false,
  });
  // A keel under the throat, tapering to nothing well clear of the floor:
  // legless is the support read, and this is what fills the space where a
  // rusher would have had legs.
  P('howlerKeel', spike(0.22, 0.62, 6), { y: 0.72, rx: Math.PI });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    P('howlerRib', slab(0.05, 0.44, 0.05), {
      x: Math.cos(a) * 0.26, y: 1.16, z: Math.sin(a) * 0.26,
    });
  }
  // The jaw hangs off a HINGE GROUP rather than being a part in its own right:
  // aiHowler rotates it open over the wind-up, and a mesh placed by P turns
  // about its own centre, which would swing the jaw through the throat instead
  // of dropping it. The hinge sits at the FRONT of the head, so the jaw falls
  // toward the player rather than straight down.
  const hinge = new THREE.Group();
  hinge.position.set(0, 1.16 * s, -0.24 * s);
  const jaw = new THREE.Mesh(geo('howlerJaw', prism(0.34, 0.16, 0.4, 5)), e.bodyMat);
  jaw.position.set(0, -0.2 * s, -0.04 * s);
  jaw.scale.setScalar(s);
  jaw.castShadow = true;
  hinge.add(jaw);
  // Two tusks on the jaw, so the mouth reads as a mouth even shut.
  for (const dir of [-1, 1]) {
    const tusk = new THREE.Mesh(geo('howlerTusk', spike(0.05, 0.26, 4)), e.bodyMat);
    tusk.position.set(dir * 0.15 * s, -0.06 * s, -0.14 * s);
    tusk.rotation.x = -0.2;
    tusk.scale.setScalar(s);
    hinge.add(tusk);
  }
  hinge.rotation.x = 0.2;
  g.add(hinge);
  e.jaw = hinge;
  // Eyes high on the brow, wide apart, over the mouth.
  eyes(P, { y: 1.44, x: 0.17, z: -0.32, r: 1.0, mat: e.eyeMat });
}

// Mostly mouth. A wide low jaw slung under a small crusted back, so the
// silhouette is a shape that is about to close on something.
export function buildGulper(e, g, s) {
  const P = partsFor(e, g, s);
  // THE JAW IS THE ENEMY. It has to be wider than the body and it has to
  // project well forward, or a gulper reads as one more four-legged rusher.
  // OPEN, and the gape is a real gap in the outline. Shut, the two plates read
  // as one snout and the enemy came out as a beetle; hinged apart they make a
  // V that is visible from anywhere, and the V is the only thing that says
  // this is a mouth about to close on somebody.
  P('gulpJawLow', prism(0.36, 0.2, 0.62, 5), { y: 0.36, z: -0.46, rx: -1.9 });
  P('gulpJawTop', prism(0.3, 0.16, 0.56, 5), { y: 0.92, z: -0.44, rx: -1.05 });
  // Teeth - short spikes along both plates, pointing INTO the gap, which is
  // what keeps the V from reading as a hinge on a machine.
  for (let i = 0; i < 4; i++) {
    const x = -0.18 + i * 0.12;
    P('gulpTooth', spike(0.05, 0.2, 4), { x, y: 0.5, z: -0.66, rx: -2.0 });
    P('gulpToothU', spike(0.05, 0.2, 4), { x, y: 0.82, z: -0.64, rx: 1.1 });
  }
  // A small crusted plate over the back, deliberately too small for the body
  // under it - the theme's whole rule in one part.
  P('gulpShell', prism(0.3, 0.26, 0.2, 6), { y: 0.86, z: 0.1, rx: 0.3 });
  P('gulpBody', lump(0.3), { y: 0.62, z: 0.14 });
  // A siphon trailing off the back. It HANGS, which is the other half of the
  // theme's language, and it is what tells the player which way round it is.
  P('gulpSiphon', spike(0.09, 0.5, 4), { y: 0.5, z: 0.42, rx: 2.2 });
  // Four stubby legs, splayed. Low to the floor - it should look like it
  // arrives at your ankles.
  for (let i = 0; i < 4; i++) {
    const sx = i < 2 ? -1 : 1;
    P('gulpLeg', slab(0.06, 0.34, 0.06), {
      x: 0.2 * sx, y: 0.18, z: (i % 2 ? 0.16 : -0.14), rz: 0.45 * sx,
    });
  }
  eyes(P, { y: 0.86, x: 0.13, z: -0.24, r: 0.7, mat: e.eyeMat });
}

// A hunched body with a LURE on a stalk out in front of it, and the lure is
// the whole read: at seventeen metres the body is a smudge and the light is
// what the player sees, hanging in the dark where the shot is going to come
// from.
export function buildAngler(e, g, s) {
  const P = partsFor(e, g, s);
  // The stalk arcs forward and over, so the light hangs in FRONT of the face
  // rather than sitting on top of the head.
  P('angStalk', slab(0.06, 0.62, 0.06), { y: 1.42, z: -0.16, rx: -0.6 });
  P('angStalk2', slab(0.06, 0.34, 0.06), { y: 1.66, z: -0.46, rx: -1.15 });
  e.angLure = P('angLure', shard(0.14), {
    y: 1.7, z: -0.66, mat: e.eyeMat, shadow: false,
  });
  // A tall narrow body under it, plated down the front and bulging at the
  // sides where the plate stops.
  P('angBody', prism(0.22, 0.3, 0.8, 5), { y: 0.78 });
  P('angPlate', slab(0.3, 0.5, 0.1), { y: 0.9, z: -0.24, rx: -0.14 });
  P('angFlank', lump(0.18), { x: -0.26, y: 0.72 });
  P('angFlank', lump(0.18), { x: 0.26, y: 0.72 });
  P('angHead', prism(0.16, 0.2, 0.24, 5), { y: 1.24, z: -0.08 });
  // Two long thin fins hanging off the back, and short legs. It should look
  // like it is standing in water rather than on a floor.
  P('angFin', slab(0.05, 0.44, 0.22), { x: -0.2, y: 0.66, z: 0.24, rz: 0.3 });
  P('angFin', slab(0.05, 0.44, 0.22), { x: 0.2, y: 0.66, z: 0.24, rz: -0.3 });
  P('angLeg', slab(0.08, 0.4, 0.09), { x: -0.13, y: 0.2 });
  P('angLeg', slab(0.08, 0.4, 0.09), { x: 0.13, y: 0.2 });
  eyes(P, { y: 1.26, x: 0.08, z: -0.2, r: 0.7, mat: e.eyeMat });
}

// A boulder of shell with a body wedged into it. Wide, low and CRUSTED - the
// plates are stacked cones rather than slabs, which is what keeps it from
// reading as the bulwark with a different colour.
export function buildBarnacle(e, g, s) {
  const P = partsFor(e, g, s);
  // The shell: three stacked cone rings, widest at the bottom. A barnacle.
  P('barnShellA', prism(0.42, 0.6, 0.34, 6), { y: 0.3 });
  P('barnShellB', prism(0.3, 0.46, 0.3, 6), { y: 0.62 });
  P('barnShellC', prism(0.2, 0.34, 0.26, 6), { y: 0.88 });
  // THE MOUTH OF IT, on top and open - a dark gap in the crust with the body
  // showing through, which is the one place worth shooting and the one part
  // that is not plate.
  e.barnMaw = P('barnMaw', shard(0.16), { y: 1.06, mat: e.eyeMat, shadow: false });
  // Two heavy arms out of the sides, and they are what it swings with. Long,
  // so the reach the melee block claims is a reach the model has.
  P('barnArm', slab(0.14, 0.14, 0.62), { x: -0.46, y: 0.66, z: -0.22, ry: 0.35 });
  P('barnArm', slab(0.14, 0.14, 0.62), { x: 0.46, y: 0.66, z: -0.22, ry: -0.35 });
  P('barnClaw', prism(0.06, 0.18, 0.26, 5), { x: -0.6, y: 0.66, z: -0.5, rx: -1.4 });
  P('barnClaw', prism(0.06, 0.18, 0.26, 5), { x: 0.6, y: 0.66, z: -0.5, rx: -1.4 });
  // A skirt of short fronds round the base. It HANGS, and it is what makes an
  // anchored barnacle look rooted rather than parked.
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2;
    P('barnFrond', spike(0.07, 0.28, 4), {
      x: Math.cos(ang) * 0.5, y: 0.12, z: Math.sin(ang) * 0.5, rx: Math.PI,
      rz: Math.cos(ang) * 0.4,
    });
  }
  eyes(P, { y: 1.0, x: 0.12, z: -0.3, r: 0.85, mat: e.eyeMat });
}

// A squat pot on legs with a wide funnel mouth aimed up and forward. It has to
// read as something that BLOWS, and the funnel is the only part that says so.
export function buildVent(e, g, s) {
  const P = partsFor(e, g, s);
  // THE FUNNEL HAS TO OVERHANG. The first draft had it at the same width as
  // the pot and barely tipped, so at eye height the two merged into one lump
  // and the enemy read as a bottle with legs - nothing about it said it blew
  // anything anywhere. It is wider than the body now and tipped most of the
  // way to horizontal, so it breaks the outline forward and the direction it
  // is aimed is legible from any bearing.
  P('ventFunnel', prism(0.52, 0.13, 0.66, 6), { y: 1.16, z: -0.34, rx: -0.95 });
  e.ventGlow = P('ventGlow', shard(0.17), {
    y: 1.24, z: -0.62, mat: e.eyeMat, shadow: false,
  });
  // A NARROWER pot under it, deliberately - the funnel only overhangs if there
  // is less body than funnel.
  P('ventPot', lump(0.33), { y: 0.6 });
  P('ventBand', prism(0.31, 0.35, 0.16, 6), { y: 0.54 });
  P('ventNeck', slab(0.14, 0.3, 0.14), { y: 0.94, z: -0.1, rx: -0.3 });
  // Three pipes hanging off the back, trailing. The theme's appendage.
  for (let i = 0; i < 3; i++) {
    P('ventPipe', slab(0.07, 0.42, 0.07), {
      x: -0.16 + i * 0.16, y: 0.4, z: 0.36, rx: 0.5,
    });
  }
  P('ventLeg', slab(0.09, 0.42, 0.11), { x: -0.22, y: 0.2, rz: 0.2 });
  P('ventLeg', slab(0.09, 0.42, 0.11), { x: 0.22, y: 0.2, rz: -0.2 });
  P('ventLeg', slab(0.09, 0.42, 0.11), { y: 0.2, z: 0.24 });
  eyes(P, { y: 0.86, x: 0.11, z: -0.36, r: 0.75, mat: e.eyeMat });
}

// A bell with a curtain under it. Read from below - the only place it is seen
// from - it is a dome with a long ragged fringe hanging down, and the fringe
// is what says the ink comes from THERE.
export function buildDrifter(e, g, s) {
  const P = partsFor(e, g, s);
  // The bell. Wide and shallow, so it is a lid on the sky rather than a body.
  P('driBell', prism(0.16, 0.62, 0.34, 8), { y: 0.7 });
  P('driCrown', prism(0.3, 0.18, 0.16, 8), { y: 0.92 });
  // THE CURTAIN. Six long trailing fronds, and they carry the silhouette:
  // without them this is a floating dish and with them it is a thing pouring
  // something out of itself.
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2;
    P('driFrond', slab(0.05, 0.72, 0.12), {
      x: Math.cos(ang) * 0.42, y: 0.18, z: Math.sin(ang) * 0.42,
      rz: Math.cos(ang) * 0.22, rx: Math.sin(ang) * -0.22,
    });
  }
  // Two shorter, thicker siphons in the middle of the curtain - the actual
  // spouts, and the only bright thing on it.
  P('driSiphon', spike(0.1, 0.44, 5), { x: -0.12, y: 0.3, rx: Math.PI, mat: e.eyeMat, shadow: false });
  P('driSiphon', spike(0.1, 0.44, 5), { x: 0.12, y: 0.3, rx: Math.PI, mat: e.eyeMat, shadow: false });
  eyes(P, { y: 0.62, x: 0.14, z: -0.4, r: 0.8, mat: e.eyeMat });
}

// ---- PLAGUE ----------------------------------------------------------------
// The theme's language: A RIND THAT HAS SPLIT. Every body is a bloated mass
// inside a hard shell that has come apart somewhere - a lid lifted, a seam
// opened, a flank hanging - with something soft and bright showing through the
// gap. Where BRINE is grown OVER and TEMPEST is held APART, PLAGUE is
// SPLITTING: the shell was closed once and is not any more.

// THE DROWNED CHOIR. One body, built three times.
//
// A robed column with a wide open MAW in its chest where a voice would come
// out of, plated across the shoulders like a shell that does not fit, and a
// veil hanging to the floor so it never looks like it has feet. The maw is
// the singing tell: it opens and brightens on the body whose turn it is, and
// that is the whole targeting information the fight gives.
export function buildChoir(e, g, s) {
  const P = partsFor(e, g, s);
  // The column. Narrow at the top and flaring to the floor - a robe.
  P('choirRobe', prism(0.42, 0.86, 1.7, 6), { y: 0.86 });
  // THE MAW, and it is a hole rather than a face: two heavy jaw plates with
  // the bright throat between them, set in the CHEST rather than in the head,
  // so the thing the player is aiming at is the widest part of the body.
  P('choirJaw', slab(0.5, 0.14, 0.2), { y: 1.34, z: -0.34, rz: 0.06 });
  P('choirJaw', slab(0.5, 0.14, 0.2), { y: 0.96, z: -0.34, rz: -0.06 });
  e.choirMaw = P('choirMaw', shard(0.26), {
    y: 1.15, z: -0.36, mat: e.eyeMat, shadow: false,
  });
  // Shoulder shell, oversized and crusted, and it does not meet in the middle
  // - the theme's rule at boss scale.
  P('choirShell', prism(0.24, 0.44, 0.34, 6), { x: -0.6, y: 1.72, rz: 0.5 });
  P('choirShell', prism(0.24, 0.44, 0.34, 6), { x: 0.6, y: 1.72, rz: -0.5 });
  // A small hooded head, deliberately dwarfed by the maw below it.
  P('choirHood', prism(0.18, 0.3, 0.42, 6), { y: 2.02 });
  P('choirCrest', spike(0.16, 0.5, 5), { y: 2.4 });
  // Long thin arms hanging straight down, and a veil of fronds round the hem.
  P('choirArm', slab(0.11, 0.9, 0.11), { x: -0.62, y: 1.1, rz: 0.12 });
  P('choirArm', slab(0.11, 0.9, 0.11), { x: 0.62, y: 1.1, rz: -0.12 });
  for (let i = 0; i < 7; i++) {
    const ang = (i / 7) * Math.PI * 2;
    P('choirVeil', slab(0.1, 0.5, 0.1), {
      x: Math.cos(ang) * 0.72, y: 0.24, z: Math.sin(ang) * 0.72,
      rz: Math.cos(ang) * 0.2, rx: Math.sin(ang) * -0.2,
    });
  }
  eyes(P, { y: 2.02, x: 0.12, z: -0.26, r: 1.0, mat: e.eyeMat });
}

// ---- AI ------------------------------------------------------------------
// An `ai(e, a)` reads the frame off `a` and writes the enemy's desired
// velocity back into `a.vx / a.vz`. Everything after that - crowd separation,
// the speed clamp, obstacles - is common and stays in update().
//
// `a` is ONE object reused for every enemy every frame (see _a below). An ai
// must not hold on to it.
//
//   a.dt    seconds
//   a.ctx   the shared enemy context from main.js
//   a.dist  metres to the player on the XZ plane
//   a.nx/nz unit vector straight at the player - what to AIM and ATTACK along
//   a.px/pz unit walking heading from the nav grid - what to WALK along
//   a.sp    this enemy's speed after freeze and slow

export const _brineAt = new THREE.Vector3();

export const _brineTo = new THREE.Vector3();

// How close it has to get to take hold, how long it rides, what the ride costs
// per second against its bite, and how long before it may try again.
//
// THE RIDE IS SHORT. Four seconds is already a long time to be unable to
// answer something with the gun, and the whole point of the enemy is to make
// the melee button and the dash worth reaching for - not to take the player's
// turn away from them.
export const GULP_LATCH_R = 1.6;

export const GULP_RIDE = 4.0;

export const GULP_DRAIN = 1.6;

export const GULP_TICK = 0.5;

export const GULP_CD = 3.5;

// Where it sits while it is on: just in front of the player and low, so it is
// at the bottom of the screen rather than inside the camera. A body snapped to
// the player's own position would be invisible from the one place the player
// is looking from, and an enemy draining somebody out of sight is the exact
// thing this game's telegraphs exist to avoid.
export const GULP_HANG = 0.62;

export const _gulpFwd = new THREE.Vector3();

export function aiGulper(e, a) {
  const ctx = a.ctx;
  const p = ctx.player;
  if (!p) return;

  if (e.latched) {
    a.vx = 0;
    a.vz = 0;
    // Carried, so nothing about the floor or the furniture applies to it. The
    // snap itself is in Enemy.update, after the move and the resolver.
    e.phase = true;
    e.gulpT -= a.dt;
    e.gulpTick -= a.dt;
    if (e.gulpTick <= 0) {
      e.gulpTick = GULP_TICK;
      ctx.onHitPlayer(e.damage * GULP_DRAIN * GULP_TICK, e.pos, e);
      if (ctx.effects) ctx.effects.burst(e.pos, 0x8ff0e0, 8, 3, 2, 0.3);
    }
    // THE TWO INPUTS THAT SHAKE IT OFF, and the clock that does it anyway.
    // Melee and dash both, because either one alone would make an unlucky
    // build - one that had spent its dash, or one mid-reload - into a player
    // with no answer at all.
    const swung = p.meleeActive > 0;
    const dashed = ctx.time < p.dashEnd;
    if (swung || dashed || e.gulpT <= 0) {
      e.latched = false;
      e.attackCd = GULP_CD;
      // Thrown clear in front of the player rather than dropped where it was
      // riding, so the thing that was just on them is somewhere they can shoot.
      p.forwardInto(_gulpFwd);
      e.pos.x = p.pos.x + _gulpFwd.x * 2.4;
      e.pos.z = p.pos.z + _gulpFwd.z * 2.4;
      e.knockT = 0.18;
      e.knockX = _gulpFwd.x * 8;
      e.knockZ = _gulpFwd.z * 8;
      e._setEyeAlert(false);
      if (ctx.effects) {
        _brineAt.set(e.pos.x, 0.8, e.pos.z);
        ctx.effects.burst(_brineAt, 0x8ff0e0, 16, 5, 2, 0.4);
      }
      if (ctx.sfx) ctx.sfx.impact();
    }
    return;
  }

  aiMelee(e, a);
  e.attackCd -= a.dt;
  if (e.attackCd > 0 || a.dist > GULP_LATCH_R) return;
  e.latched = true;
  e.gulpT = GULP_RIDE;
  e.gulpTick = 0;
  e.flash = 0.16;
  e._setEyeAlert(true);
  if (ctx.effects) ctx.effects.shockwave(p.pos, 0x1f8a8a, 2.2, 0.3);
}

export const ANGLER_RANGE = 26;

export const ANGLER_CD = 2.8;

// Hangs back and throws something the player has to decide about. Everything
// interesting is in the ROUND - see Projectile's homing and the `bubble`
// branch in _firePellet - which is correct: the enemy is a delivery system for
// a target, and a clever angler on top of a clever bubble would be two enemies.
export function aiAngler(e, a) {
  orbit(e, a, ENEMY_TYPES.angler.orbit);
  // The lure breathes whether or not it is firing. It is what the player sees
  // of this enemy at seventeen metres, so it must never go dark.
  if (e.angLure) {
    e.angLure.scale.setScalar((0.85 + Math.sin(a.ctx.time * 2.6 + e.id) * 0.2) * e.scale);
  }
  if (e.attackCd > 0 || a.dist > ANGLER_RANGE) return;
  e.attackCd = ANGLER_CD + Math.random() * 0.8;
  e.flash = 0.12;
  // From the LURE, not from the body. The light is where the player is looking.
  a.ctx.addProjectile(e.pos.x + a.nx * 0.7, 1.5, e.pos.z + a.nz * 0.7, 'angler', e._projScale());
}

// How long it holds, how often, how hard it drags, and how far the current
// reaches. The pull is weak per frame on purpose - it is a current, and a
// current is something you swim against rather than something that takes your
// legs away.
export const BARN_ANCHOR = 2.4;

export const BARN_CD = 5.0;

export const BARN_PULL = 2.6;

export const BARN_REACH = 16;

export const BARN_EYE = 1.2;

export function aiBarnacle(e, a) {
  const ctx = a.ctx;
  const p = ctx.player;
  e.barnT = (e.barnT || 0) - a.dt;

  if (e.anchored) {
    a.vx = 0;
    a.vz = 0;
    // Rooted. Nothing shoves it while it is holding, which is also what stops
    // a crowd of its own wave from walking it off the spot it chose.
    e.immovable = true;
    if (e.barnMaw) {
      e.barnMaw.scale.setScalar((0.9 + Math.sin(ctx.time * 9) * 0.25) * e.scale);
    }
    if (p && a.dist < BARN_REACH) {
      // COVER BREAKS THE CURRENT, and it is the only counter this enemy has.
      // A barnacle that pulled through a pillar would be a brute with no
      // answer at all, which is exactly what the rest of the role already is.
      const blocked = segBlocked(
        e.pos.x, BARN_EYE, e.pos.z, p.pos.x, BARN_EYE, p.pos.z, ctx.obstacles
      );
      if (!blocked) {
        if (ctx.pullPlayer) ctx.pullPlayer(e.pos.x - p.pos.x, e.pos.z - p.pos.z, BARN_PULL);
        if (ctx.effects) {
          _brineAt.set(e.pos.x, 1.1, e.pos.z);
          _brineTo.set(p.pos.x, 1.1, p.pos.z);
          ctx.effects.beam(_brineAt, _brineTo, 0x8ff0e0);
        }
      }
    }
    // It still swings at anything that gets dragged into reach.
    if (a.dist < ENEMY_TYPES.barnacle.melee.hit + 0.4) aiMelee(e, a);
    a.vx = 0;
    a.vz = 0;
    if (e.barnT <= 0) {
      e.anchored = false;
      e.immovable = false;
      e.barnT = BARN_CD;
      e._setEyeAlert(false);
    }
    return;
  }

  aiMelee(e, a);
  if (e.barnT > 0 || a.dist > BARN_REACH || a.dist < 3.5) return;
  e.anchored = true;
  e.barnT = BARN_ANCHOR;
  e.flash = 0.18;
  e._setEyeAlert(true);
  if (ctx.effects) {
    _brineAt.set(e.pos.x, 0.4, e.pos.z);
    ctx.effects.shockwave(_brineAt, 0x14615f, 3.2, 0.4);
  }
}

// The telegraph, and what stands where it lands. The column is solid for its
// whole life rather than solid only after it stops burning: two phases would
// mean a pillar that is safe to touch and one that is not, told apart by a
// clock the player cannot see.
export const VENT_RANGE = 24;

export const VENT_CD = 4.6;

export const VENT_LEAD = 1.5;

export const VENT_R = 1.7;

export const VENT_LIFE = 3.4;

export const VENT_DPS = 18;

export const VENT_HIT = 14;

export function aiVent(e, a) {
  orbit(e, a, ENEMY_TYPES.vent.orbit);
  const p = a.ctx.player;
  if (!p) return;

  if (e.ventT > 0) {
    e.ventT -= a.dt;
    if (e.ventGlow) {
      const k = 1 - Math.max(0, e.ventT) / VENT_LEAD;
      e.ventGlow.scale.setScalar((0.6 + k * 1.4) * e.scale);
    }
    if (e.ventT <= 0) {
      a.ctx.addHazard(e.ventX, e.ventZ, VENT_R, VENT_LIFE, VENT_DPS, 'scald');
      if (a.ctx.effects) {
        _brineAt.set(e.ventX, 0.4, e.ventZ);
        _brineTo.set(e.ventX, 4.0, e.ventZ);
        a.ctx.effects.beam(_brineAt, _brineTo, 0xa8ffe8);
        a.ctx.effects.burst(_brineTo, 0xa8ffe8, 22, 5, 4, 0.6);
      }
      if (a.ctx.sfx) a.ctx.sfx.impact();
      e._setEyeAlert(false);
    }
    return;
  }

  if (e.attackCd > 0 || a.dist > VENT_RANGE) return;
  e.attackCd = VENT_CD + Math.random() * 1.0;
  e.flash = 0.15;
  e._setEyeAlert(true);
  // Aimed AHEAD of the player rather than at them, because the column is cover
  // as much as it is damage: put where they were going, it walls off the lane;
  // put where they are, it would only ever be a slow hit they walk out of.
  e.ventX = p.pos.x + (p.vel ? p.vel.x * 0.8 : 0);
  e.ventZ = p.pos.z + (p.vel ? p.vel.z * 0.8 : 0);
  a.ctx.addMortar(e.ventX, e.ventZ, VENT_R + 0.6, VENT_LEAD, VENT_HIT);
  e.ventT = VENT_LEAD;
}

export const DRIFT_CD = 1.5;

export const DRIFT_R = 4.2;

export const DRIFT_LIFE = 5.0;

// Crosses over the player and pours. It does not attack and it never stops -
// what it leaves is a moving wall of ink, and the answer is to get out from
// under the line it is flying rather than to fight it.
export function aiDrifter(e, a) {
  a.vx = a.px * a.sp;
  a.vz = a.pz * a.sp;
  e.driftCd = (e.driftCd || 0) - a.dt;
  // The fronds sway. It is the only motion on it, and without it a drifter
  // parked overhead reads as a piece of the ceiling.
  e.group.rotation.z = Math.sin(a.ctx.time * 1.6 + e.id) * 0.14;
  if (e.driftCd > 0) return;
  e.driftCd = DRIFT_CD;
  // Dropped WHERE IT HAS BEEN, the same contract every trail in the game
  // keeps: ink the player can be steered into is denial, ink that appears
  // around their head is the screen going out for no reason they can see.
  a.ctx.addHazard(e.pos.x, e.pos.z, DRIFT_R, DRIFT_LIFE, 0, 'ink');
}

// How long one body holds the song, and what killing the WRONG one is worth.
export const CHOIR_SING = 4.5;

export const CHOIR_FREED = 1.45;

export const CHOIR_CD = 3.4;

export const CHOIR_PULL = 3.0;

export const CHOIR_INK_R = 5.0;

export const CHOIR_COL_R = 2.0;

// How far out the ring of columns lands. Wide enough to be a room closing
// rather than a pillar dropped on somebody's head.
export const CHOIR_RING = 3.4;

export const _choirAt = new THREE.Vector3();

export function aiChoir(e, a) {
  const bs = e.bs;
  const ctx = a.ctx;
  if (bs.voice === undefined) {
    // The body main.js stood up. It asks to be made three; the handler gives
    // this one voice 0 and the other two 1 and 2, and splits the pool between
    // them so the bar is unchanged by the fight becoming a choir.
    bs.voice = 0;
    bs.freed = 1;
    bs.cd = CHOIR_CD;
    ctx.bossEvent('choir', e);
  }
  if (bs.freed === undefined) {
    bs.freed = 1;
    bs.cd = CHOIR_CD;
  }

  // ---- who is singing -------------------------------------------------
  // COMPUTED, NOT STORED. Every body derives the singer from the same two
  // inputs - the live bodies in id order, and the clock - so all three agree
  // without any of them owning the answer, and a body that spawns or dies
  // cannot leave the others holding a stale one.
  let n = 0;
  let sum = 0;
  for (const o of ctx.enemies) {
    if (o.type !== 'choir' || o.dead) continue;
    n++;
    sum += o.id;
  }
  // RANK, not a sort. A body's place in the choir is how many live bodies have
  // a smaller id than it, which every body can work out about every other one
  // without allocating anything - and with three of them the nested walk is
  // nine comparisons.
  const want = n > 0 ? Math.floor(ctx.time / CHOIR_SING) % n : 0;
  let singerId = -1;
  for (const o of ctx.enemies) {
    if (o.type !== 'choir' || o.dead) continue;
    let rank = 0;
    for (const q of ctx.enemies) {
      if (q.type === 'choir' && !q.dead && q.id < o.id) rank++;
    }
    if (rank === want) {
      singerId = o.id;
      break;
    }
  }
  bs.singing = e.id === singerId;

  // ---- and what it cost to kill the wrong one -------------------------
  if (bs.n === undefined) {
    bs.n = n;
    bs.sum = sum;
    bs.lastSinger = singerId;
  }
  // Only a one-at-a-time loss is detected, which is the only case that
  // happens: the difference of the id sums names the body that left.
  if (n === bs.n - 1) {
    const gone = bs.sum - sum;
    if (gone !== bs.lastSinger) {
      bs.freed *= CHOIR_FREED;
      ctx.bossEvent('freed', e);
    }
  }
  bs.n = n;
  bs.sum = sum;
  bs.lastSinger = singerId;
  // The last one standing is enraged whatever order they went in.
  if (n === 1 && !bs.alone) {
    bs.alone = true;
    ctx.bossEvent('enrage', e);
  }

  // The maw is the targeting information. It opens on the singer and shuts on
  // everybody else, and it is the only difference between the three bodies.
  const mawWant = bs.singing ? 1 : 0;
  bs.maw = (bs.maw || 0) + (mawWant - (bs.maw || 0)) * Math.min(1, a.dt * 5);
  if (e.choirMaw) e.choirMaw.scale.setScalar((0.6 + bs.maw * 1.1) * e.scale);
  e._setEyeAlert(bs.singing);

  // The columns it called for, arriving. Held in one slot on the boss rather
  // than in a list, so one round is in the air at a time and a choir cannot
  // bury the arena while the player is dealing with the other two voices.
  if (e.choirCols > 0) {
    e.choirCols -= a.dt;
    if (e.choirCols <= 0) {
      for (let i = 0; i < 3; i++) {
        const ang = e.choirA + (i / 3) * Math.PI * 2;
        const cx = e.choirX + Math.cos(ang) * CHOIR_RING;
        const cz = e.choirZ + Math.sin(ang) * CHOIR_RING;
        ctx.addHazard(cx, cz, CHOIR_COL_R, VENT_LIFE, VENT_DPS, 'scald');
        if (ctx.effects) {
          _choirAt.set(cx, 0.4, cz);
          _brineTo.set(cx, 4.2, cz);
          ctx.effects.beam(_choirAt, _brineTo, 0xa8ffe8);
        }
      }
      if (ctx.sfx) ctx.sfx.impact();
    }
  }

  aiMelee(e, a);
  bs.cd -= a.dt * bs.freed;
  if (bs.cd > 0 || a.dist > 26) return;
  bs.cd = CHOIR_CD * e.rate;
  const p = ctx.player;
  if (!p) return;

  // ONE MECHANIC EACH, and they are the theme's own three. A choir is BRINE's
  // roster with a single bar over it, which is what makes the boss wave read
  // as the end of the block rather than as an unrelated fight.
  if (bs.voice === 0) {
    // The barnacle's current.
    if (ctx.pullPlayer) ctx.pullPlayer(e.pos.x - p.pos.x, e.pos.z - p.pos.z, CHOIR_PULL);
    if (ctx.effects) {
      _choirAt.set(e.pos.x, 1.2, e.pos.z);
      _brineTo.set(p.pos.x, 1.2, p.pos.z);
      ctx.effects.beam(_choirAt, _brineTo, 0x8ff0e0);
      ctx.effects.shockwave(p.pos, 0x1f8a8a, 3.0, 0.3);
    }
  } else if (bs.voice === 1) {
    // The drifter's ink, over the player rather than under itself: a boss that
    // inked its own feet would be hiding from the fight.
    ctx.addHazard(p.pos.x, p.pos.z, CHOIR_INK_R, 4.5, 0, 'ink');
  } else {
    // The vent's column, three of them in a ring around the player, so it is
    // a room being closed rather than one pillar being dropped. The bearing is
    // rolled ONCE and kept, because the mortars and the columns they become
    // have to land in the same three places - rolling it twice would put the
    // pillars somewhere the circles never were.
    e.choirX = p.pos.x;
    e.choirZ = p.pos.z;
    e.choirA = Math.random() * Math.PI * 2;
    e.choirCols = VENT_LEAD;
    for (let i = 0; i < 3; i++) {
      const ang = e.choirA + (i / 3) * Math.PI * 2;
      ctx.addMortar(
        e.choirX + Math.cos(ang) * CHOIR_RING, e.choirZ + Math.sin(ang) * CHOIR_RING,
        CHOIR_COL_R + 0.5, VENT_LEAD, VENT_HIT
      );
    }
    ctx.bossEvent('charge', e);
  }
}

// ---- TEMPEST ---------------------------------------------------------------
//
// EVERY MECHANIC IN THIS THEME IS A SEGMENT, so the two pieces of arithmetic
// below are shared by all of them rather than written out five times: how far
// a point is from a LINE BETWEEN TWO THINGS, and whether that line is
// interrupted by anything solid. The arcling's wire, the Conductor's
// discharge and the coil's sightline are the same question asked three ways,
// and they must never disagree about the answer.

// THE HOWL. Two states and one ring on the floor.
//
// While it is winding up it nearly stops - a telegraph the enemy can chase you
// with is not a telegraph, it is a countdown you cannot outrun - and the ring
// it draws is at the exact radius the scream will cover, filling as the clock
// runs down. That ring is the entire fairness of this enemy: the player is
// told where, told how big, and given the longest warning any ordinary enemy
// gives, because the thing about to happen is the one thing they cannot shoot
// their way out of afterwards.
export function aiHowler(e, a) {
  const ctx = a.ctx;
  orbit(e, a, ENEMY_TYPES.howler.orbit);
  e.hT = (e.hT || 0) - a.dt;

  if (e.hState !== 'wind') {
    if (e.hT > 0) return;
    // Nothing to scream at yet. It closes rather than howling into an empty
    // arena, which also stops a howler across the map from spending its
    // cooldown where the player will never see it.
    if (a.dist > HOWL_RADIUS + 6) {
      e.hT = 0.4;
      return;
    }
    e.hState = 'wind';
    e.hT = HOWL_WINDUP;
    e._setEyeAlert(true);
    if (ctx.effects) {
      e.hMark = ctx.effects.markAcquire();
      e.hFx = ctx.effects;
    }
    return;
  }

  // Winding up: barely moving, ring on the floor, jaw wide.
  a.vx *= 0.15;
  a.vz *= 0.15;
  const fill = 1 - Math.max(0, e.hT) / HOWL_WINDUP;
  if (e.hMark >= 0 && e.hFx) {
    // Weight 0.2: at seven metres the fill is a wash at a mortar's opacity,
    // and the RING is the part that has to be read anyway - it is the line the
    // player has to be outside of.
    e.hFx.markSet(
      e.hMark, e.pos.x, e.pos.z, HOWL_RADIUS, ENEMY_TYPES.howler.color, fill,
      1, 0, 0.2
    );
  }
  // The jaw opens over the wind-up, so the model says the same thing the ring
  // does for a player who is looking at the enemy rather than at the floor.
  if (e.jaw) e.jaw.rotation.x = 0.2 + fill * 0.75;
  if (e.hT > 0) return;

  releaseHowl(e);
  e.hState = 'idle';
  e.hT = HOWL_CD;
  e._setEyeAlert(false);
  if (e.jaw) e.jaw.rotation.x = 0.2;
  if (ctx.effects) {
    _blinkAt.set(e.pos.x, 0.06, e.pos.z);
    ctx.effects.shockwave(_blinkAt, ENEMY_TYPES.howler.color, HOWL_RADIUS, 0.45);
    _blinkAt.set(e.pos.x, 1.2, e.pos.z);
    ctx.effects.burst(_blinkAt, ENEMY_TYPES.howler.eye, 22, 6, 1.5, 0.6);
  }
  // The radius is checked at the moment it LANDS, not when it started: the
  // whole point of the wind-up is that leaving works.
  if (a.dist < HOWL_RADIUS && ctx.applyPlayerStatus) {
    ctx.applyPlayerStatus('fear', HOWL_FEAR);
    if (ctx.effects) ctx.effects.addShake(0.2);
  }
}

// Releases the floor ring a howler is holding. Named as the type's `cleanup`
// as well, because a howler shot dead mid-scream is still holding a mark and
// that pool is ten deep - see releaseMarks for the boss version of the same
// hazard.
export function releaseHowl(e) {
  if (e.hMark >= 0 && e.hFx) e.hFx.markRelease(e.hMark);
  e.hMark = -1;
}

const TYPES = {
  // ---- BRINE --------------------------------------------------------------
  //
  // The theme of things that WILL NOT LET GO. Every other theme in the game
  // asks the player to be somewhere else - off the fire, out of the field, off
  // the line - and BRINE is built so that being somewhere else is the thing it
  // takes away. A gulper is carried with you. A barnacle drags you back. A
  // vent leaves a wall where you were going. An ink cloud does not stop you
  // moving, it stops you knowing where you are.
  //
  // SO IT IS THE THEME OF THE ANSWER BEING TAKEN, where VOID is the theme of
  // the position being taken. VOID moves you; BRINE holds you.
  //
  // THE SHARED SILHOUETTE IS A SHELL THAT DOES NOT FIT. Smooth swollen masses
  // under hard crusted plate, always a size out - too small and the body
  // bulges past it, too big and it hangs off. And every one of them trails
  // something: a lure, a siphon, a frond, a curtain. Where TEMPEST is held
  // apart and STRATA is cut, BRINE is ENCRUSTED and it HANGS.

  // Latches on. On contact it stops being an enemy in the room and becomes
  // something the player is CARRYING, draining while it rides - and the only
  // ways off are a melee swing, a dash, or waiting it out.
  //
  // THE ONE ENEMY YOU WEAR. Everything else in the game is answered with the
  // gun, and this is the one that cannot be: it is at the player's own
  // position, which is the single place a first-person crosshair can never be
  // pointed. So it is the enemy that makes the melee button and the dash into
  // answers rather than into flourishes, and its whole design is a nudge
  // toward the two inputs the roster otherwise never requires.
  //
  // Weak in the bite for the afflictor's reason: what it does after the hit is
  // where its cost lives.
  gulper: {
    hp: 34, speed: 3.9, damage: 6, value: 220, color: 0x1f8a8a, eye: 0x8ff0e0,
    scale: 0.95, radius: 0.46, mass: 1,
    melee: { windup: 0.3, start: 1.4, hit: 2.0, cd: 1.0 },
    build: buildGulper, ai: aiGulper,
  },

  // Hangs at the back of the room behind a lure and throws slow homing
  // bubbles that CAN BE SHOT OUT OF THE AIR.
  //
  // The only enemy round in the game that is a target. Every other projectile
  // is a thing to dodge, and this one is a thing to decide about: it homes, so
  // it cannot simply be walked away from, and it is slow and soft, so a single
  // round kills it. What it costs is that round - which is why the angler is
  // the enemy that rewards trigger discipline and punishes a magazine already
  // dumped into the crowd.
  angler: {
    hp: 22, speed: 2.1, damage: 10, value: 280, color: 0x17706f, eye: 0xa8ffe8,
    scale: 1.05, radius: 0.48, mass: 1,
    // FURTHER OUT than any gunner but the sniper. The bubble is slow and the
    // player needs the seconds to decide about it, and an angler at eight
    // metres would be throwing a round that arrives before the decision does.
    orbit: { dist: 17, band: 3, out: 0.85, in: -0.75, strafe: 0.35, flip: 2, flipVar: 2 },
    proj: {
      core: 0xa8ffe8, glow: 0x17706f, scale: 1.1,
      // Slow, and it stays slow: the cap is barely over the base, because a
      // homing round that outruns the player at wave forty is not a decision,
      // it is a tax.
      speed: [8, 0.12, 12], dmg: [9, 0.4, 16],
      // How hard it turns, in radians a second, and that it is a target.
      home: 1.5, shootable: true,
    },
    build: buildAngler, ai: aiAngler,
  },

  // Plated, slow, and it ANCHORS: every few seconds it roots itself where it
  // stands and drags the player in with a current, so the plates are facing
  // them whether they wanted to be in front of it or not.
  //
  // The brute that cannot be kited. A tank is answered by walking backwards, a
  // dynamo by standing further off and a glacier by patience; this one closes
  // the distance for you while standing still, and the answer is to break the
  // pull by putting something solid between you - the only brute in the game
  // that cover is the counter to.
  barnacle: {
    hp: 178, speed: 1.45, damage: 22, value: 350, color: 0x14615f, eye: 0x8ff0e0,
    scale: 1.4, radius: 0.64, mass: 4,
    melee: { windup: 0.75, start: 2.8, hit: 3.4, cd: 2.2 },
    build: buildBarnacle, ai: aiBarnacle,
  },

  // Erupts a scalding column on a telegraph - and the column STAYS, as a solid
  // pillar, for two seconds after it has stopped burning.
  //
  // THE ONLY ARTILLERY THAT LEAVES COVER BEHIND IT. Everything else this role
  // does takes ground away; this one adds it, and it is not the player's. A
  // vent that walls off the lane you were about to run is doing exactly what
  // a stormcaller's patch does by the opposite means, and a vent that walls
  // off the angler you were about to shoot has just spent its cooldown
  // helping you. Which of the two it is depends entirely on where the player
  // was standing, and that is the enemy.
  vent: {
    hp: 46, speed: 1.8, damage: 0, value: 310, color: 0x2a9d8f, eye: 0xa8ffe8,
    scale: 1.15, radius: 0.55, mass: 1,
    orbit: { dist: 16, band: 2.5, out: 0.7, in: -0.5, strafe: 0.3, flip: 2.5, flipVar: 2 },
    build: buildVent, ai: aiVent,
  },

  // Rains a curtain of ink that BLOCKS THE VIEW where it falls.
  //
  // The only enemy in the game that attacks information rather than health. It
  // does no damage at all and the ink does none either - what it costs is
  // knowing where the rest of the wave is, which in a room with a barnacle and
  // an angler in it is worth more than a health bar. And it is the flier,
  // deliberately: the curtain comes down from above and across, so it cannot
  // be shot off the floor and the answer is to move out from under it.
  drifter: {
    hp: 58, speed: 3.1, damage: 0, value: 300, color: 0x0f4c4c, eye: 0x8ff0e0,
    scale: 1.1, radius: 0.5, mass: 1,
    fly: { height: 4.2 },
    hitbox: { r: 0.62, y: 0.5 },
    build: buildDrifter, ai: aiDrifter,
  },

  // Takes the trigger away. No attack of its own: it winds up a scream on a
  // fixed rhythm, draws the ring it will cover on the floor while it does, and
  // anything inside that ring when it lands cannot shoot for two and a half
  // seconds.
  //
  // THE RING IS THE WHOLE CONTRACT. A fear that arrived unannounced would be
  // the worst thing in the game - the player's gun stops working and nothing
  // on screen says why - so it is telegraphed longer than any other attack a
  // normal enemy has, and the answer is to walk out of a circle that is
  // already drawn for you. Standing in it and shooting the howler first is the
  // other answer, and it is the better one.
  howler: {
    // RE-THEMED FOR BRINE, palette only - the scream is unchanged. Teal
    // rather than the fear status's violet, because an enemy wears its
    // THEME and a status wears its own colour: the chip in the HUD and the
    // tint on an afflicted body are what carry fear, and the howler is a
    // thing in the water that the rest of BRINE has to look related to.
    hp: 60, speed: 2.1, damage: 0, value: 340, color: 0x2fb3a8, eye: 0xa8ffe8,
    scale: 1.15, radius: 0.5, mass: 1,
    orbit: { dist: 6, band: 1.5, out: 0.8, in: -0.7, strafe: 0.35, flip: 2, flipVar: 2 },
    build: buildHowler, ai: aiHowler, cleanup: releaseHowl,
  },

  // BRINE's boss. THREE BODIES SHARING ONE HEALTH BAR, and only one of them is
  // worth killing at a time.
  //
  // One of the three is always SINGING - lit, loud, and marked - and the other
  // two are silent. Damage on any of them comes off the same pool, so the bar
  // falls whichever one is shot; what changes is what happens when one DIES.
  // Kill the singer and the choir simply carries on a body short. Kill a
  // silent one and the survivors are FREED: faster, and their attacks come
  // twice as often, for the rest of the fight.
  //
  // So it is the one boss where the wrong answer is not "too slow" but
  // "aimed at the nearest one" - and the singer rotates on its own clock, so
  // the correct target keeps moving and the player has to keep looking.
  //
  // Each body carries one of the theme's three mechanics - the drag, the ink
  // and the column - so the fight is BRINE's own roster with one bar over it.
  // It ends as a single body, enraged.
  choir: {
    hp: 3450, speed: 2.6, damage: 24, value: 6000, color: 0x1f8a8a, eye: 0xa8ffe8,
    scale: 2.5, radius: 1.5, mass: 7, boss: true,
    hitbox: { r: 0.7, y: 0.8 },
    statusMul: 0.3, freezeSlow: true, slowFactor: 0.75, freezeVuln: 1.0,
    entropyExempt: true, fearMode: 'stagger',
    melee: { windup: 0.6, start: 3.0, hit: 3.8, cd: 2.0 },
    build: buildChoir, ai: aiChoir,
    cleanup: releaseMarks,
  },
};

Object.assign(ENEMY_TYPES, TYPES);
