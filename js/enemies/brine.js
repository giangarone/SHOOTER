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
  BOSS_REACH_Y, ENEMY_TYPES, MELEE_REACH_Y, SHARED_MATS, _blinkAt, _reachY,
  aiMelee, bossTouch, eyes, faceSnap, geo, landHit, lump, orbit, partsFor,
  prism, releaseMarks, segBlocked, shard, slab, snapAim, spike,
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
//
// THE TOP PLATE IS ON A HINGE, and the hinge is the strike: aiGulper drops it
// over the wind-up and slams it shut on the lunge, so the model says the same
// thing the rear-up does for a player looking at the enemy rather than past it.
// A mouth that read as permanently open - which is what static plates did -
// gave the lunge no warning at all.
export function buildGulper(e, g, s) {
  const P = partsFor(e, g, s);
  // THE JAW IS THE ENEMY. It has to be wider than the body and it has to
  // project well forward, or a gulper reads as one more four-legged rusher.
  // OPEN, and the gape is a real gap in the outline. Shut, the two plates read
  // as one snout and the enemy came out as a beetle; hinged apart they make a
  // V that is visible from anywhere, and the V is the only thing that says
  // this is a mouth about to close on somebody.
  P('gulpJawLow', prism(0.36, 0.2, 0.62, 5), { y: 0.36, z: -0.46, rx: -1.9 });
  // A keel under the lower jaw, so the underside reads as a mouth's chin and
  // not as a fifth leg.
  P('gulpKeel', spike(0.16, 0.3, 4), { y: 0.22, z: -0.5, rx: Math.PI });
  // The UPPER plate hangs off a HINGE GROUP rather than being a part in its
  // own right, exactly as the howler's jaw does: a mesh placed by P turns
  // about its own centre, which would sweep the plate through the skull
  // instead of rearing it. The hinge sits at the BACK of the head so the
  // plate lifts away from the player over the wind-up and falls on them over
  // the strike.
  const hinge = new THREE.Group();
  hinge.position.set(0, 0.98 * s, 0.08 * s);
  const plate = new THREE.Mesh(geo('gulpJawTop', prism(0.3, 0.16, 0.56, 5)), e.bodyMat);
  plate.position.set(0, 0.08 * s, -0.44 * s);
  plate.scale.setScalar(s);
  plate.castShadow = true;
  hinge.add(plate);
  // Teeth along the plate, pointing DOWN into the gap - the strike is a bite,
  // and the teeth are what says so.
  for (let i = 0; i < 4; i++) {
    const x = -0.18 + i * 0.12;
    const tooth = new THREE.Mesh(geo('gulpToothU', spike(0.05, 0.2, 4)), e.bodyMat);
    tooth.position.set(x * s, -0.02 * s, -0.6 * s);
    tooth.rotation.x = 1.1;
    tooth.scale.setScalar(s);
    hinge.add(tooth);
  }
  hinge.rotation.x = -1.05;
  g.add(hinge);
  e.jaw = hinge;
  // Teeth on the lower plate, pointing UP into the same gap.
  for (let i = 0; i < 4; i++) {
    const x = -0.18 + i * 0.12;
    P('gulpTooth', spike(0.05, 0.2, 4), { x, y: 0.5, z: -0.66, rx: -2.0 });
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

// ---- THE GULPER'S STRIKE --------------------------------------------------
//
// The old gulper LATCHED: it rode the player at GULP_HANG metres, draining
// until melee'd, dashed off or outwaited. Removed whole, and for a reason
// rather than a retheme: the latch was arithmetic that could not happen. A
// rusher at 3.9 m/s taking hold requires crossing 1.6 m of a player who walks
// at 10 and sprints far past that - the enemy reached latch range only against
// a player standing still, so the mechanic the whole type was built around
// fired once in a blue moon and read as a weak rusher the rest of the time.
//
// The strike below is built the other way round: the lunge is COMMITTED and
// faster than the player's walk, so it arrives; everything the player does
// about it is done with the gun.

// How close it will strike from, and the two sides of the mouthful: what a
// landed bite heals it for, and what fraction of the enemy's bite that is.
//
// THE HEAL IS THE WHOLE POINT OF THE TYPE. BRINE is the theme of things that
// will not let go; a thing that eats you and is the bigger for it is that idea
// with the riding removed - the answer is not to shake it off but to kill it
// during the one window it spends facing away.
export const GULP_RANGE = 9;

// Paid in the health the bite actually TOOK, read off the player before and
// after the hit: a dodged or warded bite feeds it nothing, which keeps the
// enemy honest against the passive items.
export const GULP_FEED_MUL = 1.5;

// The wind-up. Long for a rusher, because the lunge itself is unsteerable and
// the whole counterplay is being somewhere else when it lands.
export const GULP_WINDUP = 0.55;

// How far the jaw rears OPEN over the tell, in radians. The gape and the
// wind-up are the model's half of the telegraph, and the lunge closes from
// exactly this angle so the mouth reads as one motion.
export const GULP_GAPE = 0.5;

// How long it is committed for, and how fast it covers the ground. 3.3x a
// rusher's speed is ~13 m/s - faster than the player's 10 m/s walk, so the
// strike reaches a player who saw it and is still moving, which is the entire
// fix for the latch's arithmetic. It cannot TURN, so the answer is to step off
// the line, not to outrun it.
export const GULP_LUNGE = 0.5;

export const GULP_LUNGE_MUL = 3.3;

// The give-ground. A landed strike is followed by a deliberate walk backwards
// at walking pace, slower than the player closes - the kill window, and the
// only time the type is retreating. 1.15s so there is genuinely a window to
// take, short enough that the window is not a rest.
export const GULP_SWALLOW = 1.15;

// The teeth of the strike: contact during the lunge is a hit from any state,
// once per lunge, along the frozen heading.
export const GULP_STRIKE_R = 2.0;

export const GULP_CD = 2.2;

export function aiGulper(e, a) {
  const ctx = a.ctx;
  const p = ctx.player;
  if (!p) return;

  if (!e.gulp) {
    e.gulp = { state: 'walk', t: 0, hx: 0, hz: 1 };
  }
  const gs = e.gulp;
  gs.t -= a.dt;

  if (gs.state === 'lunge') {
    // RAISING THE VELOCITY IS NOT ENOUGH. Enemy.update clamps a body's step
    // to speed * stepMul, and stepMul defaults to 1.4 - an ai() that triples
    // its own velocity without touching stepMul moves at 1.4x and the strike
    // is a hurried walk. Every committed charge in the game raises it, and
    // this one is no exception.
    e.stepMul = GULP_LUNGE_MUL;
    const sp = e._effSpeed() * GULP_LUNGE_MUL;
    // NO STEERING. Off the frozen heading, exactly as the thornling's and the
    // scree's charges are: a bite that tracked would be an unavoidable hit
    // with a wind-up in front of it, and the wind-up is the whole contract.
    a.vx = gs.hx * sp;
    a.vz = gs.hz * sp;
    // The jaw falls shut over the lunge, from the gape the tell left it in,
    // so the strike lands as a mouth closing rather than as a body arriving.
    // GULP_GAPE is measured PAST the resting angle, so the close runs from
    // -(1.05 + GULP_GAPE) down to the resting -1.05, not to zero - the mouth
    // never reads as sealed shut, or the V of it stops reading as a mouth.
    if (e.jaw) {
      const fill = 1 - Math.max(0, gs.t) / GULP_LUNGE;
      e.jaw.rotation.x = -1.05 - GULP_GAPE * (1 - fill);
    }
    // Contact during the lunge is a hit, from any state - the same rule the
    // melee cycle and every committed charge hold, because a body moving this
    // fast passing through the player without touching them is the bug
    // players actually notice. The height test is the melee cycle's own rule:
    // a.dist is XZ-only, and a ground lunge must not bite somebody on a
    // catwalk any more than a swing does.
    const dy = Math.abs(p.pos.y - e.pos.y);
    if (a.dist < GULP_STRIKE_R && dy < MELEE_REACH_Y && !gs.bitten) {
      gs.bitten = true;
      const h0 = p.health;
      landHit(e, ctx);
      // IT SWALLOWS THE MOUTHFUL. Paid in the health the bite actually took,
      // not in the bite's nominal number: a dodged or warded bite feeds it
      // nothing, and a cursed player feeds it more - which is the theme's
      // own law turned round on the player.
      const fed = (h0 - p.health) * GULP_FEED_MUL;
      if (fed > 0) {
        e.hp = Math.min(e.maxHp, e.hp + fed);
        if (ctx.effects) {
          _brineAt.set(e.pos.x, 1.0, e.pos.z);
          ctx.effects.burst(_brineAt, 0x8ff0e0, 12, 4, 2, 0.4);
        }
      }
      if (ctx.sfx) ctx.sfx.meleeHit();
    }
    if (gs.t <= 0 || e.blockedBy > 0.05) {
      gs.state = 'swallow';
      gs.t = GULP_SWALLOW;
      gs.bitten = false;
      e._setEyeAlert(false);
    }
    return;
  }

  e.stepMul = 1.4;
  if (gs.state === 'tell') {
    // Planted, aimed, and visibly winding. The jaw rears OPEN over the
    // wind-up - the model's half of the telegraph, for the player watching
    // the enemy rather than the floor.
    a.vx = 0;
    a.vz = 0;
    if (e.jaw) {
      const fill = 1 - Math.max(0, gs.t) / GULP_WINDUP;
      e.jaw.rotation.x = -1.05 - fill * GULP_GAPE;
    }
    if (gs.t <= 0) {
      gs.hx = a.nx;
      gs.hz = a.nz;
      gs.state = 'lunge';
      gs.t = GULP_LUNGE;
      gs.bitten = false;
    }
    return;
  }

  if (gs.state === 'swallow') {
    // THE GIVE-GROUND. Backwards, at walking pace, for a beat and a bit: the
    // one time the type is retreating, and the window the strike buys the
    // player whether it landed or missed. It backs away from the PLAYER
    // rather than back down its own lunge line, so it does not retreat into a
    // wall pocket it then cannot be shot out of from range.
    a.vx = -a.nx * a.sp * 0.7;
    a.vz = -a.nz * a.sp * 0.7;
    // The jaw holds the resting gape: the lunge already closed it, and this
    // state is a mouth that has finished - walk leaves the angle alone too,
    // so -1.05 is the pose every other state settles into.
    if (e.jaw) e.jaw.rotation.x = -1.05;
    if (gs.t <= 0) {
      gs.state = 'walk';
      gs.t = GULP_CD * e.rate;
    }
    return;
  }

  // Walking. It still swings if the player comes to it - a striker with no
  // melee is answered by standing next to it.
  aiMelee(e, a);
  if (gs.t <= 0 && a.dist < GULP_RANGE && a.dist > ENEMY_TYPES.gulper.melee.hit) {
    gs.state = 'tell';
    gs.t = GULP_WINDUP;
    e._setEyeAlert(true);
    e.flash = 0.12;
  }
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
  if (e.driftCd > 0) return;
  e.driftCd = DRIFT_CD;
  // Dropped WHERE IT HAS BEEN, the same contract every trail in the game
  // keeps: ink the player can be steered into is denial, ink that appears
  // around their head is the screen going out for no reason they can see.
  a.ctx.addHazard(e.pos.x, e.pos.z, DRIFT_R, DRIFT_LIFE, 0, 'ink');
}

// ---- THE DROWNED CHOIR ---------------------------------------------------
//
// THREE BODIES, ONE BAR - and a fight that never holds still. The first
// choir stood its ground and sang one of three notes every few seconds; this
// one WHEELS around the player the whole fight, casts on staggered clocks
// short enough that a telegraph is nearly always up somewhere, and every
// note is one of the theme's own mechanics at boss scale:
//
//   undertow   the gulper's strike. A lane is drawn at full length and
//              fills; the rush down it is COMMITTED and faster than the
//              player's walk, and the deliberate back-drift after it is the
//              window the strike buys.
//   riptide    the barnacle's current. The ring rides the PLAYER while the
//              maw opens, then the body anchors and drags, and what breaks
//              the line is what breaks every drag in this theme: cover.
//   inkscreen  the drifter's curtain, thrown. Mortar-telegraphed blooms of
//              ink where the player is and where they were going - it costs
//              sight, never health.
//   wellring   the vent's column as a room closing: five wedges around the
//              player, one left open. The pillars rise where the circles
//              stood, so the gap the warning showed is the gap that is there.
//   chorus     the angler's bubble as a bar of music: a rearing tell, then
//              a fan of slow homing rounds down a LOCKED line - every one of
//              them a target, which is the theme's own discipline test.
//
// ...and over all of it the HYMN, which only the SINGER carries: the
// howler's scream at boss scale, a wide ring around the body that takes the
// trigger from anyone still inside it when it lands. The one note in the
// song that cannot be shot out of the air is the one you are told the
// longest about.
//
// What did NOT change: the bar is still one pool shared three ways, and the
// wrong kill is still punished - the singer is lit and sings the louder,
// faster half; kill the singer and the choir carries on a body short, kill
// a silent one and the rest are FREED. And touching a body is always a
// bite, from any state: bossTouch never stops for the song.

// How long one body holds the song, and what killing the WRONG one is worth.
export const CHOIR_SING = 4.5;

export const CHOIR_FREED = 1.45;

// How often ONE body sings, before the wave's `rate` and the freed and
// singing multipliers hurry it. Down from 3.4 in the old fight: with three
// bodies on staggered clocks something is always being telegraphed, which
// is the point of the rework.
export const CHOIR_CD = 2.2;

// THE WHEEL. Each body holds the station a third of the circle from its
// sisters', and the circle itself never stops turning - the fight orbits
// the player between casts, so the same note never arrives twice from the
// same bearing and "where is it coming from next" is always being asked.
export const CHOIR_ORBIT = 9.5;

export const CHOIR_WHEEL = 0.3;

// THE RUSH. 14 m/s: faster than the player's walk and slower than the
// sprint - the gulper's law at boss scale, so the answer is to step off the
// lane, not to outrun it. The dash covers its length in one commitment.
export const CHOIR_RUSH_WINDUP = 0.85;

export const CHOIR_RUSH_LEN = 18;

export const CHOIR_RUSH_W = 2.4;

export const CHOIR_RUSH_SPEED = 14;

export const CHOIR_RUSH_DUR = 1.45;

// Contact anywhere along the rush, once, and capped the way every boss blow
// is - the wave-50 multiplier on an uncapped 1.6x hit is a one-shot.
export const CHOIR_RUSH_CAP = 40;

// Not from arm's length, where it would be a second swing with extra steps;
// not from across the arena, where the lane is up so long it is scenery.
export const CHOIR_RUSH_MIN = 6;

export const CHOIR_RUSH_RANGE = 26;

// THE GIVE-GROUND, hit or miss: a deliberate back-drift at half pace, and
// the window the player is paid in for the dodge.
export const CHOIR_RUSH_EBB = 0.9;

// THE CURRENT.
export const CHOIR_RIP_WINDUP = 0.75;

export const CHOIR_RIP_RANGE = 17;

export const CHOIR_RIP_HOLD = 1.7;

// Stronger than the barnacle's 2.6 - a boss's current is the hardest pull
// in the theme, still under a walking player: swimming out stays possible,
// standing still in it does not.
export const CHOIR_RIP_PULL = 4.6;

export const CHOIR_RIP_EYE = 1.6;

// INKSCREEN. Dealt at ZERO like the drifter's curtain: what it costs is
// never health, it is the seconds the rest of the choir get inside the dark.
export const CHOIR_INK_N = 2;

export const CHOIR_INK_R = 3.6;

export const CHOIR_INK_DELAY = 1.3;

export const CHOIR_INK_LIFE = 4.5;

// THE WELL RING.
export const CHOIR_RING_N = 5;

export const CHOIR_RING_R = 3.6;

export const CHOIR_COL_R = 2.0;

export const CHOIR_RING_CAP = 26;

// THE CHORUS. Slow, homing, and every round a target: what it spends is the
// player's trigger while the other notes are up; what it costs the choir is
// that the trigger can spend it back.
export const CHOIR_CHORUS_WINDUP = 0.7;

export const CHOIR_CHORUS_N = 3;

// THE HYMN - the singer's own note, on its own clock. Telegraphed as long
// as the howler's, because the attack that takes the trigger is the one
// being caught inside must always be a mistake rather than a coin toss.
export const CHOIR_HYMN_R = 10;

export const CHOIR_HYMN_WINDUP = 1.4;

export const CHOIR_HYMN_GAP = 4.0;

// Each body's VERSE is a different rotation of the same five notes - voice 0
// opens with the current, 1 with the ink, 2 with the pillars - so which body
// it is still shapes the fight, and no body's song is only its own mechanic.
// Exported for the brine suite, which drives a body through its own verse.
export const CHOIR_VERSES = [
  ['riptide', 'undertow', 'inkscreen', 'chorus', 'wellring'],
  ['inkscreen', 'chorus', 'undertow', 'wellring', 'riptide'],
  ['wellring', 'undertow', 'chorus', 'riptide', 'inkscreen'],
];

export const _choirAt = new THREE.Vector3();

// The current's sightline, at the height the maw drags from - the SAME
// question the barnacle's own pull asks: something solid on the line means
// there is no current.
function choirSees(e, p, ctx) {
  return !segBlocked(
    e.pos.x, CHOIR_RIP_EYE, e.pos.z, p.pos.x, CHOIR_RIP_EYE, p.pos.z, ctx.obstacles
  );
}

// Which note this body sings next. Its verse is walked in order and a note
// that cannot be taken is SKIPPED, not waited on - a rush needs a lane, the
// current needs the player in reach with no other current already running -
// so a body always finds something to sing instead of idling behind a cast
// it cannot make.
function choirPick(e, a) {
  const bs = e.bs;
  const ctx = a.ctx;
  // The singer's own note, and only while it is singing.
  if (bs.singing && bs.hymnT <= 0 && a.dist < CHOIR_HYMN_R + 5) return 'hymn';
  for (let k = 0; k < 5; k++) {
    const c = bs.verse[bs.turn % 5];
    bs.turn++;
    if (c === 'undertow' && (a.dist < CHOIR_RUSH_MIN || a.dist > CHOIR_RUSH_RANGE)) continue;
    if (c === 'riptide') {
      if (a.dist > CHOIR_RIP_RANGE) continue;
      // ONE CURRENT AT A TIME. The drag is the strongest thing the choir
      // does, and two sisters dragging at once would be a stun wearing a
      // warning - it keeps its strength by coming alone.
      let busy = false;
      for (const o of ctx.enemies) {
        if (o !== e && !o.dead && o.type === 'choir' && o.bs &&
          (o.bs.state === 'rip-tell' || o.bs.state === 'riptide')) busy = true;
      }
      if (busy) continue;
    }
    return c;
  }
  // The chorus is legal at any range: a body that found nothing else still
  // has something to say.
  return 'chorus';
}

export function aiChoir(e, a) {
  const bs = e.bs;
  const ctx = a.ctx;
  const p = ctx.player;
  if (!p) return;

  if (bs.voice === undefined) {
    // The body main.js stood up. It asks to be made three; the handler gives
    // this one voice 0 and the other two 1 and 2, and splits the pool between
    // them so the bar is unchanged by the fight becoming a choir.
    bs.voice = 0;
    ctx.bossEvent('choir', e);
  }
  if (bs.state === undefined) {
    bs.freed = bs.freed === undefined ? 1 : bs.freed;
    bs.state = 'roam';
    // Staggered by voice, so the three of them open the song a third of a
    // bar apart rather than in unison.
    bs.cd = (0.6 + bs.voice * 0.7) * e.rate;
    bs.turn = 0;
    bs.verse = CHOIR_VERSES[bs.voice % 3];
    bs.mark = -1;
    bs.fx = ctx.effects;
    bs.hymnT = 1.5;
    bs.casts = 0;
  }
  // Held fresh every frame: releaseMarks reaches the pool through bs.fx at
  // death, and a stale one would strand a mark mid-song.
  bs.fx = ctx.effects;
  if (bs.hymnT > 0) bs.hymnT -= a.dt;

  // CONTACT IS ALWAYS A BITE, from any state - the thing attacking you is a
  // BODY, and being inside it is the mistake the whole theme is about. The
  // rush is the one exception: it arrives as its own heavier hit and would
  // double-bill the same frame.
  if (bs.state !== 'dash') bossTouch(e, a);

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
  // RANK, not a sort. A body's place in the choir is how many live bodies
  // have a smaller id than it, which every body can work out about every
  // other one without allocating anything - and with three of them the
  // nested walk is nine comparisons.
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

  // The maw is the targeting information, as it always was: open on the
  // singer, shut on the silent - and opened WIDE by every wind a body is
  // making, so the face says the same thing as the floor for the player who
  // is watching the enemy rather than the ring.
  const open = Math.min(1,
    (bs.singing ? 0.55 : 0) + (bs.state !== 'roam' && bs.state !== 'ebb' ? 0.45 : 0));
  bs.maw = (bs.maw || 0) + (open - (bs.maw || 0)) * Math.min(1, a.dt * 6);
  if (e.choirMaw) e.choirMaw.scale.setScalar((0.6 + bs.maw * 1.1) * e.scale);
  e._setEyeAlert(bs.state !== 'roam' && bs.state !== 'ebb');

  // ---- the committed states run out whatever happens ------------------
  // A rush already out of the gate, the drift after it and a current already
  // holding are NOT called back by fear: the stagger rule the other bosses
  // keep is about what is still being AIMED, not what has already been sung.
  if (bs.state === 'dash') {
    bs.t -= a.dt;
    // Without raising the step cap, update()'s clamp turns fourteen metres a
    // second into a brisk walk - the gulper's own footnote, kept.
    e.stepMul = CHOIR_RUSH_SPEED / Math.max(0.5, a.sp);
    a.vx = e.nx * CHOIR_RUSH_SPEED;
    a.vz = e.nz * CHOIR_RUSH_SPEED;
    faceSnap(e);
    // Contact anywhere down the rush is the bite, once - heavier than a
    // touch, and capped the way every boss's promise caps its hits.
    if (!bs.rushHit && a.dist < e.radius + 1.6 && _reachY(a) < BOSS_REACH_Y) {
      bs.rushHit = true;
      ctx.onHitPlayer(Math.min(CHOIR_RUSH_CAP, e.damage * 1.6), e.pos, e);
      _choirAt.set(e.pos.x, 1.4, e.pos.z);
      ctx.effects.burst(_choirAt, 0x8ff0e0, 20, 6, 2, 0.5);
      ctx.effects.addShake(0.25);
      if (ctx.sfx) ctx.sfx.meleeHit();
    }
    if (bs.t <= 0 || e.blockedBy > 0.05) {
      const slammed = e.blockedBy > 0.05;
      if (slammed) {
        _choirAt.set(e.pos.x, 0.4, e.pos.z);
        ctx.effects.shockwave(_choirAt, ENEMY_TYPES.choir.color, 5, 0.45);
        ctx.effects.burst(_choirAt, 0xa8ffe8, 20, 6, 2, 0.5);
        ctx.effects.addShake(0.2);
      }
      bs.state = 'ebb';
      bs.t = CHOIR_RUSH_EBB * (slammed ? 1.6 : 1);
      e.stepMul = 1.4;
    }
    return;
  }

  if (bs.state === 'ebb') {
    bs.t -= a.dt;
    e.stepMul = 1.4;
    // THE GIVE-GROUND, the gulper's swallow at boss scale: backwards at half
    // pace, slower than the player closes - the window, and the only time in
    // the fight a body is retreating.
    a.vx = -a.nx * a.sp * 0.55;
    a.vz = -a.nz * a.sp * 0.55;
    if (bs.t <= 0) bs.state = 'roam';
    return;
  }

  if (bs.state === 'riptide') {
    bs.t -= a.dt;
    a.vx = 0;
    a.vz = 0;
    // Planted for the whole hold: the drag is the attack and the rooted body
    // is the window it pays. COVER BREAKS THE CURRENT - the barnacle's law,
    // kept at boss scale, because a drag through a pillar would be one with
    // no answer.
    if (a.dist < CHOIR_RIP_RANGE + 5 && choirSees(e, p, ctx)) {
      if (ctx.pullPlayer) ctx.pullPlayer(e.pos.x - p.pos.x, e.pos.z - p.pos.z, CHOIR_RIP_PULL);
      _choirAt.set(e.pos.x, CHOIR_RIP_EYE, e.pos.z);
      _brineTo.set(p.pos.x, CHOIR_RIP_EYE, p.pos.z);
      ctx.effects.beam(_choirAt, _brineTo, 0x8ff0e0);
      if (e.choirMaw) e.choirMaw.scale.setScalar((0.7 + Math.sin(ctx.time * 10) * 0.22) * e.scale);
    }
    if (bs.t <= 0) {
      e._setEyeAlert(false);
      bs.state = 'roam';
    }
    return;
  }

  // Terror staggers a boss rather than sending it running - the contract
  // fearMode:'stagger' declares. A note still being TELEGRAPHED is called
  // off here, and the mark goes back with it: a feared body that kept its
  // warning drawn would be a hit arriving after the fight it came from.
  if (e.status.fear > 0) {
    if (bs.mark >= 0 && bs.fx) {
      bs.fx.markRelease(bs.mark);
      bs.mark = -1;
    }
    if (bs.state !== 'roam') bs.state = 'roam';
    bs.cd = Math.max(bs.cd, 0.8);
    return;
  }

  // ---- the tells --------------------------------------------------------
  if (bs.state === 'undertow-tell') {
    bs.t -= a.dt;
    a.vx = 0;
    a.vz = 0;
    faceSnap(e);
    // The lane at full length from the first frame, filling as the wind runs
    // out: the AREA reads instantly, the fill says when.
    if (bs.mark >= 0 && bs.fx) {
      bs.fx.markSet(
        bs.mark,
        e.pos.x + e.nx * CHOIR_RUSH_LEN * 0.5, e.pos.z + e.nz * CHOIR_RUSH_LEN * 0.5,
        CHOIR_RUSH_W, 0x8ff0e0, 1 - Math.max(0, bs.t) / CHOIR_RUSH_WINDUP,
        CHOIR_RUSH_LEN / (2 * CHOIR_RUSH_W), Math.atan2(-e.nx, -e.nz)
      );
    }
    if (bs.t <= 0) {
      if (bs.mark >= 0 && bs.fx) {
        bs.fx.markRelease(bs.mark);
        bs.mark = -1;
      }
      bs.state = 'dash';
      bs.t = CHOIR_RUSH_DUR;
      bs.rushHit = false;
      _choirAt.set(e.pos.x, 0.5, e.pos.z);
      ctx.effects.burst(_choirAt, 0x8ff0e0, 18, 6, 2, 0.5);
      if (ctx.sfx) ctx.sfx.meleeHit();
      ctx.bossEvent('charge', e);
    }
    return;
  }

  if (bs.state === 'rip-tell') {
    bs.t -= a.dt;
    a.vx = 0;
    a.vz = 0;
    // Planted, and the ring rides the PLAYER rather than the body: it is not
    // where the current reaches, it is where YOU are about to be seized, so
    // the warning stands in the exact spot that stops being safe.
    if (bs.mark >= 0 && bs.fx) {
      bs.fx.markSet(bs.mark, p.pos.x, p.pos.z, 2.1, 0x8ff0e0,
        1 - Math.max(0, bs.t) / CHOIR_RIP_WINDUP, 1, 0, 0.5);
    }
    _choirAt.set(e.pos.x, CHOIR_RIP_EYE, e.pos.z);
    _brineTo.set(p.pos.x, CHOIR_RIP_EYE, p.pos.z);
    ctx.effects.beam(_choirAt, _brineTo, 0x8ff0e0);
    if (bs.t <= 0) {
      if (bs.mark >= 0 && bs.fx) {
        bs.fx.markRelease(bs.mark);
        bs.mark = -1;
      }
      bs.state = 'riptide';
      bs.t = CHOIR_RIP_HOLD;
      _choirAt.set(e.pos.x, 1.2, e.pos.z);
      ctx.effects.burst(_choirAt, 0x8ff0e0, 14, 5, 1.6, 0.4);
    }
    return;
  }

  if (bs.state === 'chorus-tell') {
    bs.t -= a.dt;
    a.vx = 0;
    a.vz = 0;
    faceSnap(e);
    if (bs.t <= 0) {
      bs.state = 'roam';
      e._setEyeAlert(false);
      const n = CHOIR_CHORUS_N + (bs.alone ? 2 : 0);
      const base = Math.atan2(e.nz, e.nx);
      // Locked at the TELEGRAPH, as every committed attack in the game is:
      // the fan goes down the line the body squared up on, and stepping off
      // it is the answer - a fan that tracked would be homing twice over.
      const live = Math.atan2(p.pos.z - e.pos.z, p.pos.x - e.pos.x);
      for (let i = 0; i < n; i++) {
        ctx.addProjectile(
          e.pos.x + e.nx * 1.4, e.pos.y + 2.4, e.pos.z + e.nz * 1.4,
          'angler', e._projScale(), base + (i - (n - 1) / 2) * 0.26 - live
        );
      }
      _choirAt.set(e.pos.x + e.nx * 1.4, e.pos.y + 2.4, e.pos.z + e.nz * 1.4);
      ctx.effects.burst(_choirAt, 0xa8ffe8, 16, 5, 2, 0.4);
      if (ctx.sfx) ctx.sfx.impact();
    }
    return;
  }

  if (bs.state === 'hymn') {
    bs.t -= a.dt;
    a.vx = 0;
    a.vz = 0;
    // Drawn at the exact radius the scream covers and filling as the verse
    // runs down - the howler's contract at boss scale: the player is told
    // where, told how big, and being inside when it lands is the mistake.
    if (bs.mark >= 0 && bs.fx) {
      bs.fx.markSet(bs.mark, e.pos.x, e.pos.z, CHOIR_HYMN_R,
        ENEMY_TYPES.choir.color, 1 - Math.max(0, bs.t) / CHOIR_HYMN_WINDUP, 1, 0, 0.2);
    }
    if (bs.t <= 0) {
      if (bs.mark >= 0 && bs.fx) {
        bs.fx.markRelease(bs.mark);
        bs.mark = -1;
      }
      bs.state = 'roam';
      e._setEyeAlert(false);
      _choirAt.set(e.pos.x, 0.06, e.pos.z);
      ctx.effects.shockwave(_choirAt, ENEMY_TYPES.choir.color, CHOIR_HYMN_R, 0.5);
      _choirAt.set(e.pos.x, 1.6, e.pos.z);
      ctx.effects.burst(_choirAt, 0xa8ffe8, 24, 6, 1.6, 0.6);
      ctx.effects.addShake(0.2);
      if (ctx.sfx) ctx.sfx.impact();
      // The radius is checked at the moment it LANDS, not when it started:
      // the whole point of the long wind-up is that leaving works.
      if (a.dist < CHOIR_HYMN_R && ctx.applyPlayerStatus) {
        ctx.applyPlayerStatus('fear', HOWL_FEAR);
      }
    }
    return;
  }

  if (bs.state === 'cast') {
    bs.t -= a.dt;
    a.vx = 0;
    a.vz = 0;
    if (bs.t <= 0) bs.state = 'roam';
    return;
  }

  // ---- roam: the wheel, and the next note -------------------------------
  bs.cd -= a.dt * bs.freed * (bs.singing ? 1.35 : 1);
  // Each body holds the station a third of the circle from its sisters', and
  // the circle itself turns the whole time - the fight orbits the player
  // between casts instead of parking in front of them.
  const wheelAng = bs.voice * (Math.PI * 2 / 3) + ctx.time * CHOIR_WHEEL;
  const wx = p.pos.x + Math.cos(wheelAng) * CHOIR_ORBIT - e.pos.x;
  const wz = p.pos.z + Math.sin(wheelAng) * CHOIR_ORBIT - e.pos.z;
  const wd = Math.hypot(wx, wz);
  if (wd > 0.5) {
    a.vx = (wx / wd) * a.sp;
    a.vz = (wz / wd) * a.sp;
  }
  if (bs.cd > 0) return;
  bs.cd = (CHOIR_CD + Math.random() * 0.9) * e.rate;
  const cast = choirPick(e, a);
  bs.casts++;
  if (cast === 'undertow') {
    snapAim(e, a, true);
    bs.state = 'undertow-tell';
    bs.t = CHOIR_RUSH_WINDUP;
    bs.mark = ctx.effects.markAcquire();
    return;
  }
  if (cast === 'riptide') {
    bs.state = 'rip-tell';
    bs.t = CHOIR_RIP_WINDUP;
    bs.mark = ctx.effects.markAcquire();
    e.flash = 0.15;
    return;
  }
  if (cast === 'chorus') {
    snapAim(e, a, true);
    bs.state = 'chorus-tell';
    bs.t = CHOIR_CHORUS_WINDUP;
    return;
  }
  if (cast === 'hymn') {
    bs.state = 'hymn';
    bs.t = CHOIR_HYMN_WINDUP;
    bs.hymnT = CHOIR_HYMN_GAP * e.rate;
    bs.mark = ctx.effects.markAcquire();
    e.flash = 0.15;
    return;
  }
  // inkscreen and the well ring are one planted breath: the mortars they
  // call draw the warnings, the body only stands still long enough to throw.
  bs.state = 'cast';
  bs.t = 0.4;
  e.flash = 0.15;
  choirFire(e, a, cast);
}

// The two THROWN notes, fired once at the cast. The rings are the mortar
// system's own warnings and the ground payload is what the circle becomes -
// the ink lands dark, the ring lands solid, and neither owes the fight a
// second mechanism.
function choirFire(e, a, cast) {
  const bs = e.bs;
  const ctx = a.ctx;
  const p = ctx.player;
  if (cast === 'inkscreen') {
    // One bloom where the player IS, the rest where they are GOING: the dark
    // keeps pace with a dodge through it, and a player who holds still is
    // smothered where they stood.
    const n = CHOIR_INK_N + (bs.alone ? 1 : 0);
    const px = p.pos.x + (p.vel ? p.vel.x * 0.5 : 0);
    const pz = p.pos.z + (p.vel ? p.vel.z * 0.5 : 0);
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = i === 0 ? 0 : 2.6 + Math.random() * 1.6;
      ctx.addMortar(px + Math.cos(ang) * r, pz + Math.sin(ang) * r,
        CHOIR_INK_R, CHOIR_INK_DELAY, 0,
        { radius: CHOIR_INK_R, life: CHOIR_INK_LIFE, dps: 0, kind: 'ink' });
    }
    return;
  }
  // THE WELL RING. Five wedges around the player, exactly one left open -
  // a room that is closing, not a cell. The bearing is rolled ONCE: the gap
  // the circles drew and the gap the pillars leave have to be the same gap.
  const gapAt = (Math.random() * CHOIR_RING_N) | 0;
  const off = Math.random() * Math.PI * 2;
  for (let i = 0; i < CHOIR_RING_N; i++) {
    if (i === gapAt) continue;
    const ang = off + (i / CHOIR_RING_N) * Math.PI * 2;
    ctx.addMortar(
      p.pos.x + Math.cos(ang) * CHOIR_RING_R, p.pos.z + Math.sin(ang) * CHOIR_RING_R,
      CHOIR_COL_R + 0.5, VENT_LEAD, Math.min(CHOIR_RING_CAP, e.damage * 0.9),
      { radius: CHOIR_COL_R, life: VENT_LIFE, dps: VENT_DPS, kind: 'scald' }
    );
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
  // takes away. A gulper eats you and is the bigger for it. A barnacle drags
  // you back. A vent leaves a wall where you were going. An ink cloud does not
  // stop you moving, it stops you knowing where you are.
  //
  // SO IT IS THE THEME OF THE ANSWER BEING TAKEN, where VOID is the theme of
  // the position being taken. VOID moves you; BRINE holds you.
  //
  // THE SHARED SILHOUETTE IS A SHELL THAT DOES NOT FIT. Smooth swollen masses
  // under hard crusted plate, always a size out - too small and the body
  // bulges past it, too big and it hangs off. And every one of them trails
  // something: a lure, a siphon, a frond, a curtain. Where TEMPEST is held
  // apart and STRATA is cut, BRINE is ENCRUSTED and it HANGS.

  // Strikes, swallows, and gives ground. It rears with the jaw opening, lunges
  // down a line it can no longer steer, and a landed bite FEEDS it - healed by
  // the health the mouthful actually took - before it deliberately backs off,
  // slower than the player closes. That back-step is the kill window, and the
  // whole enemy is the trade: take the hit or take the window.
  //
  // THE OLD LATCH IS GONE, and not rethemed: it was arithmetic that could not
  // happen. A 3.9 m/s rusher had to cross 1.6 m of a player who walks at 10,
  // so it took hold only of somebody standing still, and the rest of the time
  // the type read as a weak rusher. The strike below arrives - committed at
  // 3.3x, faster than the player's walk - and never touches the player's
  // position, so it is answered with the gun the whole way.
  //
  // Mid-band damage for the role: the bite is a single committed hit rather
  // than a drain, and what it costs the player is health AND the window it
  // then hands them.
  gulper: {
    head: { r: 0.3, y: 0.86 },
    hp: 34, speed: 3.9, damage: 10, value: 220, color: 0x1f8a8a, eye: 0x8ff0e0,
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
    head: { r: 0.3, y: 1.26 },
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
    head: { r: 0.32, y: 1 },
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
    head: { r: 0.3, y: 0.86 },
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
    head: { r: 0.28, y: 0.62 },
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
    head: { r: 0.32, y: 1.44 },
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

  // BRINE's boss. THREE BODIES SHARING ONE HEALTH BAR, and the one boss that
  // is never standing where you left it.
  //
  // The fight is the whole theme at full scale. The bodies WHEEL around the
  // player instead of parking in front of them, they sing on staggered
  // clocks short enough that a telegraph is nearly always up somewhere, and
  // every note is one of the roster's own mechanics grown up: the gulper's
  // committed rush down a drawn lane, the barnacle's current with the same
  // cover rule, the drifter's ink thrown where you are going, the vent's
  // columns rising as a ring with one gap, and a fan of the angler's homing
  // bubbles. The singer - lit, maw open, the louder half - alone carries the
  // howler's scream, the one note that takes the trigger rather than health.
  //
  // The strategy is unchanged because it IS the fight: the bar is one pool,
  // the singing rotates on its own clock, and killing a silent body FREES
  // the other two. What changed is that nothing in it holds still long
  // enough to be answered by standing there and shooting - and touching a
  // body is always a bite, from any state.
  //
  // Speed is the fastest of any boss's walk: the wheel only works if the
  // bodies genuinely outflank a player who is watching one of them.
  choir: {
    head: { r: 0.42, y: 2.02 },
    hp: 3450, speed: 3.3, damage: 24, value: 6000, color: 0x1f8a8a, eye: 0xa8ffe8,
    scale: 2.5, radius: 1.5, mass: 7, boss: true,
    hitbox: { r: 0.7, y: 0.8 },
    statusMul: 0.3, freezeSlow: true, slowFactor: 0.75, freezeVuln: 1.0,
    entropyExempt: true, fearMode: 'stagger',
    build: buildChoir, ai: aiChoir,
    cleanup: releaseMarks,
  },
};

Object.assign(ENEMY_TYPES, TYPES);
