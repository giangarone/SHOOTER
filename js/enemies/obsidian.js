// OBSIDIAN's six enemies and its boss.
//
// One file per theme, and it imports NOTHING from any other theme - see
// shared.js for why. What is here is this theme's stat blocks, its models, its
// behaviour and the constants only it uses; anything a second theme wanted is
// in shared.js by construction.
//
// The entries are registered into ENEMY_TYPES at the bottom rather than
// exported for someone else to assemble, so importing this file is what puts
// the theme in the game and index.js is a list of imports rather than a table
// that has to be kept in step with twelve others.

import * as THREE from 'three';
import {
  BOSS_REACH_Y, ENEMY_TYPES, MELEE_REACH_Y, SHARED_MATS, _bossAt, aiMelee,
  bossTouch, eyes, geo, landHit, lump, orbit, partsFor, prism, releaseMarks,
  slab, spike,
} from './shared.js';

// ---- the theme ------------------------------------------------------------
//
// THE EDGE, AND WHERE IT IS GOING TO BE. Every theme buys its pressure with
// something - EMBER spends floor, HIVE spends bodies, SOLAR spends
// information. OBSIDIAN spends GEOMETRY: volcanic glass, dark bodies with one
// hot cutting edge, and every mechanic below is the same idea at a different
// role -
//
//   clast     a rusher that commits to a straight lunge it cannot steer, and
//             the edge travels ONWARD past the player. The question is where
//             the line will be, not where the body is
//   lancet    fires a wall of three needles that HOMES, slowly. The only
//             enemy round in the game that follows you - and it can be shot
//             down, because the wall turns wide and the answer is to be
//             somewhere else in a second
//   maser     a walking furnace of glass. The front half is a cooled shell
//             that eats most of what lands on it, and the heart is exposed
//             and full-price: the brute you aim at
//   knapper   the only artillery whose landing is a WALL. It strikes a blade
//             out of the floor - real, solid geometry for three seconds -
//             and whether that cover is yours or theirs depends entirely on
//             where you were going
//   mirror    no attack; it opens a RIFT beside the player that pulses wider
//             the longer it stands, and the answer is to move now rather than
//             to shoot it later
//   glasswing the high line. It sweeps a thin crimson arc across the floor
//             for over a second, then drops a glass shard along it - the
//             weeper's read with the edge's promise: the line tells you
//             exactly where not to be
//
// THE SHARED SILHOUETTE IS THE EDGE - one long slab carried clear of a dark
// glass body, with a hot crimson seam running down it. Every model in the
// theme is built around that one bright line, and the AI behind it always
// commits to a direction. Where PLAGUE is splitting and STRATA is cut,
// OBSIDIAN is SHARP - and the one question every one of its enemies asks is
// where the edge is about to be.
//
// SO IT IS THE THEME OF LINES THAT STAY LINES. Not areas, not status: geometry
// you can read at a glance and answer with your feet, because everything in
// the theme tells you where it is going to be before it is there.

// ---- the theme's one colour, as constants ----------------------------------
//
// The theme's dark glass and its hot edge. These live here rather than in
// shared.js because no second theme wants them - the moment one does, they
// move (see shared.js's own rule). OBSIDIAN_EDGE is the seam: every model in
// the family carries it, and every projectile and effect the theme produces
// is in the same family so the whole arena reads as one material.
export const OBSIDIAN_GLASS = 0x1c1622;
export const OBSIDIAN_EDGE = 0xff3b30;
export const OBSIDIAN_EDGE_BRIGHT = 0xff8a80;

// The material for the lit seam. Emissive, and NOT tinted by status, so a
// frozen or poisoned OBSIDIAN enemy still reads as carrying the edge - the
// same rule the tank's furnace follows (see shared.js).
export const OBSIDIAN_SEAM = new THREE.MeshStandardMaterial({
  color: OBSIDIAN_EDGE, emissive: OBSIDIAN_EDGE, emissiveIntensity: 1.5,
  roughness: 0.25, metalness: 0.55,
});

// The theme's family material for the dark glass shell, the way tankPlate is
// RUST's and hiveChitin is HIVE's - one body material so the family reads as
// one thing under any status tint.
export const OBSIDIAN_SHELL = new THREE.MeshStandardMaterial({
  color: 0x221a2e, roughness: 0.5, metalness: 0.4,
});

// ---- the clast --------------------------------------------------------------
// How long the lunge telegraphs, how far it runs, and the cooldown. The
// windup is short because the COMMIT is the whole warning: a clast locks a
// heading at the start of the lunge and cannot turn, so what the player is
// reading is a line, and the line is drawn the moment the eyes flare.
export const CLAST_TELL = 0.55;
export const CLAST_LUNGE = 2.2;
export const CLAST_LUNGE_MUL = 2.2;
export const CLAST_CD = 3.2;
export const CLAST_RANGE = 20;
export const CLAST_MIN = 3;
// How far past the body the edge itself reaches - the blade sweeps a wider
// band than the body that carries it. Matched to the shrike's dive reach:
// wide enough that a graze clips a player who only half-committed to the
// dodge, narrow enough that one real step clears it.
export const CLAST_EDGE_REACH = 1.9;
// How hard the edge shoves. It knocks the player ALONG the lunge, exactly as
// the scree's roll does: what a blade costs is position, not health.
export const CLAST_KNOCK = 6;

// ---- the lancet -------------------------------------------------------------
export const LANCET_CD = 2.4;
export const LANCET_RANGE = 24;
export const LANCET_SPREAD = 0.14;
// How hard the needles home, in radians a second. Slow: a wall that turned
// fast would be undodgeable by direction, and the whole answer is to cross
// its line rather than to outrun it.
export const LANCET_HOME = 0.6;

// ---- the maser --------------------------------------------------------------
// What the shell takes off a hit while the heart is shut. Between a bulwark's
// 80% and a borer's two thirds: the maser is the theme's brute, and the shell
// is one FACING of it rather than a plate to shoot around.
export const MASER_SHELL_ARMOR = 0.3;
// How far the heat pulse reaches when the maser swings. Short, and it is the
// same on both sides of the swing: the heart is what hurts, and the heart is
// where the edge shows.
export const MASER_PULSE_R = 3.0;
export const MASER_PULSE_DMG = 6;

// ---- the knapper ------------------------------------------------------------
export const KNAPPER_CD = 5.0;
export const KNAPPER_RANGE = 22;
export const KNAPPER_TELL = 1.0;
export const KNAPPER_HIT = 14;
export const KNAPPER_WALL_R = 1.0;
export const KNAPPER_WALL_H = 3.6;
export const KNAPPER_WALL_LIFE = 3.2;

// ---- the mirror -------------------------------------------------------------
// The rift: how fast it opens, how wide it gets, and how long before it cuts.
// The rift is a GROWING area rather than a telegraph that fills - what it
// asks is "move now", and the pulse on the floor is the tell that carries
// from across the room.
export const MIRROR_RANGE = 14;
export const MIRROR_CD = 4.2;
export const MIRROR_TELL = 1.1;
export const MIRROR_RIFT_R = 2.6;
export const MIRROR_RIFT_GROW = 4.0;
export const MIRROR_RIFT_DMG = 12;

// ---- the glasswing ----------------------------------------------------------
export const WING_HIGH = 5.2;
export const WING_TELL = 1.2;
export const WING_SWEEP = 0.2;
export const WING_RANGE = 26;
export const WING_CLIMB = 1.5;

// ---- the boss ----------------------------------------------------------------
//
// THE MONOLITH'S EDGE... no - THE SMOKING MIRROR. The theme's boss is the
// edge taken to boss scale: a slab of obsidian standing on one end, dragging
// itself about on cracked legs, and everything it does draws a LINE across
// the room.
//
//   the CRESCENT  it plants, telegraphs a lane, then sweeps a crescent of
//                 glass along that lane - the clast's lunge at boss scale,
//                 answered by the same things the clast is
//   the RAIN      it stops, the ceiling above the player lights, and glass
//                 falls on three circles at once - the widest question the
//                 boss asks, and the only one that is an area
//   the WALLS     it drives two blades out of the floor, one either side of
//                 where the player is standing - real geometry, the knapper's
//                 trick doubled, and the lane between them is the only safe
//                 place
//   the MIRROR (under a third)  its face SPLITS. The seam down the middle
//                 opens, the room floods with the edge's own red, and every
//                 attack comes twice as often - but the split face takes
//                 FULL damage, where the shut face eats a third of it. The
//                 last third of the fight is the window the whole fight was
//                 building to.

export const MIRRORBOSS_CRESCENT_TELL = 1.0;
export const MIRRORBOSS_CRESCENT_SPEED = 13;
export const MIRRORBOSS_CRESCENT_CAP = 30;
export const MIRRORBOSS_CRESCENT_REACH = 2.0;
export const MIRRORBOSS_CRESCENT_CD = 7;
export const MIRRORBOSS_RAIN_CD = 8;
export const MIRRORBOSS_RAIN_N = 3;
export const MIRRORBOSS_RAIN_R = 3.2;
export const MIRRORBOSS_RAIN_DELAY = 1.4;
export const MIRRORBOSS_RAIN_DMG = 22;
export const MIRRORBOSS_WALLS_CD = 11;
export const MIRRORBOSS_WALL_TELL = 0.9;
export const MIRRORBOSS_WALL_OFF = 4.4;
export const MIRRORBOSS_WALL_LIFE = 3.0;
export const MIRRORBOSS_WALL_R = 1.1;
export const MIRRORBOSS_WALL_H = 3.6;
// The enrage: where the face splits, and what it costs and pays.
export const MIRRORBOSS_SPLIT_FRAC = 0.33;
export const MIRRORBOSS_SPLIT_ARMOR = 0.33;
export const MIRRORBOSS_SPLIT_RATE = 0.5;

// Scratch, module-level and reused like every other vector in the roster.
export const _obsidianAt = new THREE.Vector3();
export const _obsidianTo = new THREE.Vector3();

// A four-sided spike, this theme's own head shape: reads sharper than the
// five-sided one most of the roster shares, and the geometry cache is keyed
// by the closure's own dims so the two never collide.
const shardSpike = (r, h) => () => new THREE.ConeGeometry(r, h, 4);

// ---- the models -------------------------------------------------------------

// A leaning wedge of dark glass with one enormous blade slung forward under
// it, edge-up, red seam along the whole length. Read: it is not coming for
// you - it is coming for where you are standing, and the blade is what does
// the arriving.
export function buildClast(e, g, s) {
  const P = partsFor(e, g, s);
  // A low wedge body, leaning hard into the lunge.
  P('clastBody', prism(0.34, 0.16, 0.66, 5), { y: 0.74, rx: -0.3, ry: Math.PI / 5 });
  P('clastShoulder', prism(0.3, 0.24, 0.2, 5), { y: 1.06, z: 0.08 });
  // THE BLADE. Two thirds of the silhouette and the entire mechanic: a long
  // slab held out in FRONT, level, with the seam along its length. Wider than
  // the body by a good margin, so the outline reads as edge-first from any
  // bearing.
  P('clastBlade', slab(0.2, 0.08, 1.3), { y: 0.62, z: -0.62, rx: 0.12 });
  P('clastSeam', slab(0.04, 0.045, 1.26), {
    y: 0.58, z: -0.62, rx: 0.12, mat: OBSIDIAN_SEAM, shadow: false,
  });
  // A small head sunk between the shoulders - the blade is the identity, not
  // the face.
  P('clastHead', shardSpike(0.14, 0.3), { y: 1.16, z: -0.14, rx: -0.4 });
  // Thick folded legs under it, coiled - the posture of a thing that springs.
  P('clastLeg', slab(0.11, 0.52, 0.12), { x: -0.15, y: 0.28, rz: 0.24 });
  P('clastLeg', slab(0.11, 0.52, 0.12), { x: 0.15, y: 0.28, rz: -0.24 });
  P('clastLeg', slab(0.1, 0.4, 0.11), { x: -0.14, y: 0.24, z: 0.3, rz: 0.3 });
  P('clastLeg', slab(0.1, 0.4, 0.11), { x: 0.14, y: 0.24, z: 0.3, rz: -0.3 });
  eyes(P, { y: 1.16, x: 0.09, z: -0.3, r: 0.7, mat: e.eyeMat });
}

// Upright and narrow, with a long three-pronged needle array forward and the
// seams glowing in all three tips. Read: it is standing off, and what it
// throws is a wall.
export function buildLancet(e, g, s) {
  const P = partsFor(e, g, s);
  // A thin column, a shade taller than a chaser.
  P('lancetSpine', slab(0.14, 0.78, 0.14), { y: 0.88 });
  P('lancetCollar', prism(0.2, 0.16, 0.18, 6), { y: 1.24 });
  P('lancetHead', shardSpike(0.12, 0.24), { y: 1.36, z: -0.06, rx: -0.3 });
  // THE ARRAY. Three needles fanned forward, each with a bright tip - the
  // silhouette says "wall" before the first one fires.
  const needle = spike(0.05, 0.72, 4);
  e.lanTips = [
    P('lancetNeedle', needle, { x: -0.22, y: 1.1, z: -0.38, rx: -Math.PI / 2.16, rz: 0.1, mat: SHARED_MATS.gunmetal }),
    P('lancetNeedle', needle, { y: 1.16, z: -0.46, rx: -Math.PI / 2.16, mat: SHARED_MATS.gunmetal }),
    P('lancetNeedle', needle, { x: 0.22, y: 1.1, z: -0.38, rx: -Math.PI / 2.16, rz: -0.1, mat: SHARED_MATS.gunmetal }),
  ];
  for (const t of e.lanTips) {
    const tip = new THREE.Mesh(
      geo('lancetTip', () => new THREE.SphereGeometry(0.045, 6, 6)),
      OBSIDIAN_SEAM
    );
    tip.position.set(0, 0, -0.36);
    t.add(tip);
  }
  // The seam down the spine - the one straight line on the body.
  P('lancetSeam', slab(0.035, 0.72, 0.035), { y: 0.88, z: -0.075, mat: OBSIDIAN_SEAM, shadow: false });
  // Thin splayed legs. Nothing about this enemy is heavy.
  P('lancetLeg', slab(0.05, 0.5, 0.05), { x: -0.14, y: 0.26, rz: 0.4 });
  P('lancetLeg', slab(0.05, 0.5, 0.05), { x: 0.14, y: 0.26, rz: -0.4 });
  P('lancetStrut', slab(0.04, 0.42, 0.04), { x: -0.2, y: 0.22, z: 0.1, rz: 0.55 });
  P('lancetStrut', slab(0.04, 0.42, 0.04), { x: 0.2, y: 0.22, z: 0.1, rz: -0.55 });
  eyes(P, { y: 1.34, x: 0.08, z: -0.16, r: 0.7, mat: e.eyeMat });
}

// A squat furnace of dark glass plates, hunched around a burning heart. The
// front is a cooled shell; the seam runs down the back where the plates
// meet. Read: the front is a wall and the middle is the answer.
export function buildMaser(e, g, s) {
  const P = partsFor(e, g, s);
  // THE SHELL. Wide flat plates angled into the charge, wider than anything
  // behind them - the front-facing half of the enemy in two parts.
  P('maserPlate', slab(0.62, 0.42, 0.26), { y: 0.86, z: -0.28, rx: 0.3, mat: OBSIDIAN_SHELL });
  P('maserPlate2', slab(0.54, 0.36, 0.22), { y: 0.6, z: -0.44, rx: 0.44, mat: OBSIDIAN_SHELL });
  // THE HEART, burning in a gap on the chest - the exposed full-price half.
  e.masHeart = P('maserHeart', prism(0.14, 0.18, 0.1, 6), {
    y: 0.9, z: -0.42, rx: Math.PI / 2, mat: OBSIDIAN_SEAM, shadow: false,
  });
  // A heavy low body behind the plates.
  P('maserBody', lump(0.36), { y: 0.6, z: 0.14, sx: 1.1, sy: 0.9, sz: 1.3 });
  // The seam down the back, where the shell halves meet - the tell for the
  // side the player should not be standing on.
  P('maserSeam', slab(0.05, 0.5, 0.06), { y: 0.72, z: 0.36, mat: OBSIDIAN_SEAM, shadow: false });
  // A small head under the plate lip.
  P('maserHead', prism(0.12, 0.14, 0.22, 5), { y: 0.52, z: -0.52, rx: -1.1 });
  eyes(P, { y: 0.58, x: 0.09, z: -0.62, r: 0.7, mat: e.eyeMat });
  // Six stub legs, three a side - short and strong, the legs of a pusher.
  for (let i = 0; i < 6; i++) {
    const side = i % 2 ? 1 : -1;
    const k = Math.floor(i / 2);
    P('maserLeg', slab(0.09, 0.3, 0.09), {
      x: side * 0.32, y: 0.14, z: -0.3 + k * 0.34, rz: side * 0.32,
    });
  }
}

// A knapper at work: a hunched body with a hammer of glass raised over one
// shoulder and a long chisel held forward at the floor - the outline says
// "it is about to strike the ground", and that is exactly what it does.
export function buildKnapper(e, g, s) {
  const P = partsFor(e, g, s);
  // THE CHISEL, held out flat and forward, tip at the floor, seam along it.
  P('knapperChisel', slab(0.16, 0.07, 1.0), { y: 0.42, z: -0.42, rx: 0.08 });
  P('knapperChiselSeam', slab(0.03, 0.035, 0.96), {
    y: 0.38, z: -0.42, rx: 0.08, mat: OBSIDIAN_SEAM, shadow: false,
  });
  // THE HAMMER, raised and cocked over the right shoulder - the tell that
  // the strike is coming, driven by the AI to fall just before it does.
  e.knapHammer = P('knapperHammer', slab(0.26, 0.16, 0.2), {
    x: 0.34, y: 1.42, z: 0.14, rz: -0.6, mat: OBSIDIAN_SHELL,
  });
  // A narrow stooped body under the raised arm, leaning away from the weight.
  P('knapTorso', prism(0.2, 0.26, 0.56, 5), { y: 0.86, rx: -0.24, ry: Math.PI / 5 });
  P('knapHead', prism(0.11, 0.14, 0.2, 5), { y: 1.1, z: -0.26, rx: -0.5 });
  P('knapArm', slab(0.09, 0.09, 0.4), { x: -0.28, y: 0.94, z: -0.18, rx: 0.5 });
  // The flint-load riding the back: two nodules of raw glass, one lit.
  P('knapNodule', lump(0.16), { y: 1.2, z: 0.28 });
  P('knapNoduleLit', lump(0.12), { x: -0.18, y: 1.12, z: 0.3, mat: OBSIDIAN_SEAM, shadow: false });
  P('knapLeg', slab(0.11, 0.46, 0.12), { x: -0.14, y: 0.24 });
  P('knapLeg', slab(0.11, 0.46, 0.12), { x: 0.14, y: 0.24 });
  eyes(P, { y: 1.1, x: 0.07, z: -0.38, r: 0.7, mat: e.eyeMat });
}

// A small dark body entirely in service of one enormous polished slab it
// carries before it, tilted, with the seam running down the slab's face. The
// slab is a mirror and the mirror is the enemy.
export function buildMirror(e, g, s) {
  const P = partsFor(e, g, s);
  // THE SLAB. Most of the model by area, held forward and tilted back, wide
  // enough to hide the body behind it.
  e.mirSlab = P('mirSlab', slab(0.72, 1.0, 0.09), {
    y: 1.0, z: -0.26, rx: -0.14, mat: OBSIDIAN_SHELL,
  });
  // THE SEAM down its face - the rift the enemy is holding shut. Driven by
  // the AI: it brightens and widens as the rift nears.
  e.mirSeam = P('mirSeam', slab(0.045, 0.8, 0.02), {
    y: 1.0, z: -0.33, rx: -0.14, mat: OBSIDIAN_SEAM, shadow: false,
  });
  // A small bowed body under and behind it.
  P('mirTorso', prism(0.16, 0.22, 0.4, 5), { y: 0.72, z: 0.14, rx: 0.3, ry: Math.PI / 5 });
  P('mirHead', prism(0.09, 0.11, 0.16, 5), { y: 0.92, z: -0.04, rx: -0.6 });
  // Three thin legs, splayed - the read of a thing that leans on what it
  // carries.
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.6;
    P('mirLeg', slab(0.045, 0.5, 0.045), {
      x: Math.cos(a) * 0.18, y: 0.26, z: Math.sin(a) * 0.16 + 0.08,
      rz: -Math.cos(a) * 0.5, rx: Math.sin(a) * 0.3,
    });
  }
  eyes(P, { y: 0.94, x: 0.06, z: -0.14, r: 0.6, mat: e.eyeMat });
}

// The high line. A small hunched thorax with two long swept blades for wings
// and one razor of a tail hanging beneath - the mass is in the edges, and
// the seams run down every one of them.
export function buildGlasswing(e, g, s) {
  const P = partsFor(e, g, s);
  // THE WING-BLADES. Long, thin, swept back and slightly dihedral - glass
  // knives rather than wings, seams along their trailing edges.
  const wing = slab(0.85, 0.04, 0.22);
  P('wingBlade', wing, { x: -0.48, y: 0.98, z: 0.12, ry: 0.5, rz: 0.2, mat: OBSIDIAN_SHELL });
  P('wingBlade', wing, { x: 0.48, y: 0.98, z: 0.12, ry: -0.5, rz: -0.2, mat: OBSIDIAN_SHELL });
  P('wingSeam', slab(0.8, 0.02, 0.02), {
    x: -0.5, y: 1.0, z: -0.02, ry: 0.5, rz: 0.2, mat: OBSIDIAN_SEAM, shadow: false,
  });
  P('wingSeam', slab(0.8, 0.02, 0.02), {
    x: 0.5, y: 1.0, z: -0.02, ry: -0.5, rz: -0.2, mat: OBSIDIAN_SEAM, shadow: false,
  });
  // THE TAIL RAZOR, hanging below and forward - the part that lands.
  P('wingTail', spike(0.06, 0.6, 4), { y: 0.5, z: -0.18, rx: -Math.PI / 1.9, mat: SHARED_MATS.gunmetal });
  // A small hunched body between the blades.
  P('wingThorax', prism(0.17, 0.22, 0.38, 5), { y: 0.9, z: 0.02, rx: 0.26 });
  P('wingHead', prism(0.09, 0.12, 0.18, 5), { y: 0.76, z: -0.22, rx: -1.3 });
  eyes(P, { y: 0.8, x: 0.06, z: -0.32, r: 0.6, mat: e.eyeMat });
}

// THE SMOKING MIRROR. A tall slab of obsidian stood on its end and cracked
// down the middle, dragging itself on three heavy legs, the seam running the
// whole height of it. Everything about the model says which half is which:
// the face opens when the fight is ready to end.
export function buildMirrorboss(e, g, s) {
  const P = partsFor(e, g, s);
  // THE SLAB. Nearly the whole model: a tall dark plate, cracked down the
  // centre, standing on end.
  P('bossPlateL', slab(0.5, 1.7, 0.24), { x: -0.26, y: 1.24, rz: 0.06, mat: OBSIDIAN_SHELL });
  P('bossPlateR', slab(0.5, 1.7, 0.24), { x: 0.26, y: 1.24, rz: -0.06, mat: OBSIDIAN_SHELL });
  // THE SEAM, down the crack between them. Driven by the AI: it widens and
  // brightens through the fight and BLAZES open when the face splits.
  e.bs.seam = P('bossSeam', slab(0.06, 1.55, 0.06), {
    y: 1.26, z: -0.12, mat: OBSIDIAN_SEAM, shadow: false,
  });
  // THE CRESCENT BLADE, slung under the front lip - what the charge sweeps
  // with. Held on the enemy so the AI can angle it along the coming lunge.
  e.bs.crescent = P('bossCrescent', slab(0.9, 0.1, 0.14), {
    y: 0.5, z: -0.34, rx: 0.1,
  });
  P('bossCrescentSeam', slab(0.86, 0.03, 0.03), {
    y: 0.56, z: -0.34, rx: 0.1, mat: OBSIDIAN_SEAM, shadow: false,
  });
  // THE EYES - two bright shards high on the face, one to a side, so the
  // split reads as each half keeping one.
  P('bossEye', shardSpike(0.09, 0.22), { x: -0.2, y: 1.74, z: -0.2, rx: -1.2, mat: e.eyeMat, shadow: false });
  P('bossEye', shardSpike(0.09, 0.22), { x: 0.2, y: 1.74, z: -0.2, rx: -1.2, mat: e.eyeMat, shadow: false });
  // THREE heavy legs, splayed wide under the slab - two forward, one behind,
  // the posture of a thing that drags itself about.
  P('bossLeg', slab(0.16, 0.9, 0.16), { x: -0.34, y: 0.46, z: -0.18, rz: 0.34, rx: -0.1 });
  P('bossLeg', slab(0.16, 0.9, 0.16), { x: 0.34, y: 0.46, z: -0.18, rz: -0.34, rx: -0.1 });
  P('bossLegBack', slab(0.18, 0.84, 0.18), { y: 0.44, z: 0.5, rx: 0.3 });
}

// ---- the AI -----------------------------------------------------------------

// The clast. Walks in, and from mid-range commits to a lunge: a straight
// line it cannot steer, telegraphed by the eyes and the blade lifting. The
// whole enemy is the question "is the line going to cross you", and the whole
// answer is one step sideways.
export function aiClast(e, a) {
  if (!e.cl) e.cl = { state: 'walk', t: 0, hx: 0, hz: 1, hit: false };
  const cl = e.cl;
  cl.t -= a.dt;

  if (cl.state === 'lunge') {
    // COMMITTED. The heading was locked at the tell and does not turn - the
    // same contract the thornling's charge and the bloatfly's dive keep: what
    // the player is being asked to read is a line, and a line that followed
    // them would not be one.
    e.stepMul = CLAST_LUNGE_MUL;
    const sp = e._effSpeed() * CLAST_LUNGE_MUL;
    a.vx = cl.hx * sp;
    a.vz = cl.hz * sp;
    // The blade swings wide of the body, so the edge's reach is the body's
    // own radius plus the blade's band. It shoves along the lunge rather
    // than hitting hard: what it costs is position, at the moment the whole
    // theme is about position.
    if (!cl.hit && a.dist < e.radius + CLAST_EDGE_REACH) {
      const dy = Math.abs(a.ctx.player.pos.y - e.pos.y);
      if (dy < MELEE_REACH_Y) {
        cl.hit = true;
        landHit(e, a.ctx);
        if (a.ctx.pullPlayer) a.ctx.pullPlayer(cl.hx, cl.hz, CLAST_KNOCK);
        _obsidianAt.set(e.pos.x, 0.8, e.pos.z);
        if (a.ctx.effects) a.ctx.effects.burst(_obsidianAt, OBSIDIAN_EDGE, 12, 5, 2, 0.4);
      }
    }
    // The lunge ends on TIME rather than on arrival - it is a committed
    // crossing, not a chase, and cover ending it early is the same answer
    // the scree's roll keeps.
    if (cl.t <= 0 || e.blockedBy > 0.05) {
      cl.state = 'walk';
      cl.t = CLAST_CD * e.rate;
      e.stepMul = 1.4;
      cl.hit = false;
      e._setEyeAlert(false);
    }
    return;
  }

  e.stepMul = 1.4;
  if (cl.state === 'tell') {
    a.vx = 0;
    a.vz = 0;
    if (cl.t <= 0) {
      cl.hx = a.nx;
      cl.hz = a.nz;
      cl.state = 'lunge';
      cl.t = CLAST_LUNGE;
      cl.hit = false;
      _obsidianAt.set(e.pos.x, 0.5, e.pos.z);
      if (a.ctx.effects) {
        a.ctx.effects.shockwave(_obsidianAt, OBSIDIAN_EDGE, 2, 0.3);
      }
    }
    return;
  }

  aiMelee(e, a);
  if (cl.t <= 0 && a.dist < CLAST_RANGE && a.dist > CLAST_MIN) {
    cl.state = 'tell';
    cl.t = CLAST_TELL;
    e._setEyeAlert(true);
    e.flash = 0.12;
  }
}

// The lancet. Orbits and fires a simultaneous fan of three homing needles -
// a wall, not a stream, and the wall turns slowly toward the player. Each
// needle is shootable (see the `proj` block) and each costs the player a
// bullet or a step: the answer is to cross the wall's line before it turns
// onto you, exactly as the coil's bolt is answered by cover.
export function aiLancet(e, a) {
  orbit(e, a, ENEMY_TYPES.lancet.orbit);
  // The alert holds one beat past the shot so the player sees the wall
  // leave, then drops - the spitter's contract, no weapon to point so the
  // eyes are the aim.
  if (e.lanAlertT > 0) {
    e.lanAlertT -= a.dt;
    if (e.lanAlertT <= 0) e._setEyeAlert(false);
  }
  if (e.attackCd > 0 || a.dist > LANCET_RANGE) return;
  e.attackCd = LANCET_CD + Math.random() * 0.8;
  e.flash = 0.14;
  e._setEyeAlert(true);
  for (let i = -1; i <= 1; i++) {
    a.ctx.addProjectile(
      e.pos.x, 1.1, e.pos.z, 'lancet', e._projScale(), i * LANCET_SPREAD
    );
  }
  _obsidianAt.set(e.pos.x, 1.1, e.pos.z);
  if (a.ctx.effects) a.ctx.effects.burst(_obsidianAt, OBSIDIAN_EDGE, 8, 3, 2, 0.4);
  e.lanAlertT = 0.2;
}

// The maser. The shared melee cycle plus the heart: the heart's glow tracks
// the health bar (brighter as the shell weakens is a lie - brighter as the
// FIGHT goes on is honest, because the shell is the same from full to empty;
// what changes is that the player has longer to look at it). The pulse goes
// out with every landed swing, through the melee block's own damage, so no
// second damage path exists to get wrong.
export function aiMaser(e, a) {
  aiMelee(e, a);
  const ctx = a.ctx;
  // The heart beats on its own clock - a maser at rest is still a furnace.
  if (e.masHeart) {
    e.masBeat = ((e.masBeat ?? 0) + a.dt * 2.2) % (Math.PI * 2);
    const k = 0.9 + Math.sin(e.masBeat) * 0.25;
    e.masHeart.scale.set(k * e.scale, k * e.scale, k * e.scale);
  }
  // The pulse: fired out of the SWING rather than out of a separate clock,
  // so the one damage cadence the enemy has is the one the melee cycle
  // already keeps. e.swing > 0 is the live window of a thrown swing - the
  // same read the melee block's own landHit uses.
  if (e.swing > 0 && !e.masPulsed) {
    e.masPulsed = true;
    const p = ctx.player;
    if (p) {
      const dx = p.pos.x - e.pos.x;
      const dz = p.pos.z - e.pos.z;
      if (dx * dx + dz * dz < MASER_PULSE_R * MASER_PULSE_R
        && Math.abs(p.pos.y - e.pos.y) < MELEE_REACH_Y) {
        ctx.onHitPlayer(MASER_PULSE_DMG, e.pos, e);
        _obsidianAt.set(e.pos.x, 1.0, e.pos.z);
        if (ctx.effects) ctx.effects.burst(_obsidianAt, OBSIDIAN_EDGE_BRIGHT, 14, 4, 2, 0.5);
      }
    }
    if (ctx.effects) {
      _obsidianAt.set(e.pos.x, 0.2, e.pos.z);
      ctx.effects.shockwave(_obsidianAt, OBSIDIAN_EDGE, MASER_PULSE_R, 0.35);
    }
  }
  if (e.swing <= 0) e.masPulsed = false;
}

// The knapper. Orbits, raises the hammer for a full second, then strikes the
// ground: a blade of obsidian stands up out of the floor where the player
// was GOING - aimed ahead of them by the same lead a vent's column keeps -
// and it is real solid geometry for three seconds. Cover that is also a
// wall, and whose it is depends on where you were going.
export function aiKnapper(e, a) {
  const ctx = a.ctx;
  orbit(e, a, ENEMY_TYPES.knapper.orbit);
  const p = ctx.player;
  if (!p) return;

  if (e.knapT > 0) {
    e.knapT -= a.dt;
    // The hammer rises over the whole tell - one continuous motion the
    // player can read from anywhere in the room.
    if (e.knapHammer) {
      const k = Math.min(1, 1 - Math.max(0, e.knapT) / KNAPPER_TELL);
      e.knapHammer.rotation.z = -0.6 - k * 0.9;
      e.knapHammer.position.y = (1.42 + k * 0.3) * e.scale;
    }
    if (e.knapT <= 0) {
      e._setEyeAlert(false);
      if (e.knapHammer) {
        e.knapHammer.rotation.z = -0.6;
        e.knapHammer.position.y = 1.42 * e.scale;
      }
      // THE STRIKE. A solid blade out of the floor - the scald's whole
      // contract: a real box in both obstacle lists, released by the hazard
      // system on the same clock as every other hazard, so it cannot
      // outlive the wave that raised it. The mortar queued at the tell's
      // start is the impact - the wall itself deals nothing, exactly as the
      // scald's box deals nothing and the vent's burn lives in the patch.
      ctx.addHazard(
        e.knapX, e.knapZ, KNAPPER_WALL_R, KNAPPER_WALL_LIFE, 0, 'edge'
      );
      _obsidianAt.set(e.knapX, 0.2, e.knapZ);
      _obsidianTo.set(e.knapX, 3.4, e.knapZ);
      if (ctx.effects) {
        ctx.effects.beam(_obsidianAt, _obsidianTo, OBSIDIAN_EDGE);
        ctx.effects.burst(_obsidianAt, OBSIDIAN_EDGE, 18, 6, 3, 0.6);
      }
      if (ctx.sfx) ctx.sfx.impact();
    }
    return;
  }

  if (e.attackCd > 0 || a.dist > KNAPPER_RANGE) return;
  e.attackCd = KNAPPER_CD + Math.random() * 1.2;
  e.knapT = KNAPPER_TELL;
  e.flash = 0.16;
  e._setEyeAlert(true);
  // AHEAD of the player, by the same 0.8s lead the vent's column keeps: the
  // wall is for the lane they are using, not the spot they have left.
  e.knapX = Math.max(-20, Math.min(20, p.pos.x + (p.vel ? p.vel.x * 0.8 : 0)));
  e.knapZ = Math.max(-20, Math.min(20, p.pos.z + (p.vel ? p.vel.z * 0.8 : 0)));
  // ONE mortar, and it IS the impact: the circle fills for the whole tell
  // and the blow lands on the frame the blade stands up. The wall deals
  // nothing itself - it is cover, and whose it is depends on where the
  // player was going.
  ctx.addMortar(e.knapX, e.knapZ, KNAPPER_WALL_R + 0.8, KNAPPER_TELL, KNAPPER_HIT);
}

// The mirror. No projectile, no swing - it holds its station and opens a
// RIFT on the ground beside the player: a growing, pulsing area that swells
// over a full second and then cuts. The answer is to move NOW, and the tell
// is the pulse itself - a mirror at rest is a wall, and a mirror whose slab
// is flaring is a wall about to fall somewhere.
export function aiMirror(e, a) {
  const ctx = a.ctx;
  orbit(e, a, ENEMY_TYPES.mirror.orbit);
  const p = ctx.player;
  if (!p) return;

  // The slab flares as the rift nears - carried on the model, so the tell is
  // visible from across the room exactly as a spitter's sac swell is.
  const near = e.mirT > 0;
  if (e.mirSeam) {
    const k = e.mirT > 0 ? 1 - Math.max(0, e.mirT) / MIRROR_TELL : 0;
    const w = 0.045 + k * 0.075;
    e.mirSeam.scale.x = w / 0.045 * e.scale;
    e.mirSeam.position.z = (-0.33 - k * 0.02) * e.scale;
  }
  e._setEyeAlert(near);

  if (e.mirT > 0) {
    e.mirT -= a.dt;
    const k = 1 - Math.max(0, e.mirT) / MIRROR_TELL;
    // Kept current every frame, so releaseMirror can hand the handle back
    // from wherever the mirror died - the grub's own contract.
    e._fx = ctx.effects;
    // The rift grows and fills under the player's feet - the telegraph is
    // the whole attack, and the radius it ends at is the radius it hurts at.
    if (e.mirMark >= 0) {
      ctx.effects.markSet(
        e.mirMark, e.mirX, e.mirZ, MIRROR_RIFT_R + k * MIRROR_RIFT_GROW,
        OBSIDIAN_EDGE, k, 1, 0, 0.6
      );
    }
    if (e.mirT > 0) return;
    // THE CUT. Anyone inside the rift's final radius takes the hit - through
    // onHitPlayer like every discrete blow in the game.
    if (e.mirMark >= 0) {
      ctx.effects.markRelease(e.mirMark);
      e.mirMark = -1;
    }
    e._setEyeAlert(false);
    const dx = p.pos.x - e.mirX;
    const dz = p.pos.z - e.mirZ;
    const R = MIRROR_RIFT_R + MIRROR_RIFT_GROW;
    if (dx * dx + dz * dz < R * R && p.pos.y < 1.2) {
      ctx.onHitPlayer(MIRROR_RIFT_DMG, _obsidianAt.set(e.mirX, 0.5, e.mirZ), e);
    }
    _obsidianAt.set(e.mirX, 0.3, e.mirZ);
    if (ctx.effects) {
      ctx.effects.shockwave(_obsidianAt, OBSIDIAN_EDGE, R, 0.4);
      ctx.effects.burst(_obsidianAt, OBSIDIAN_EDGE_BRIGHT, 22, 6, 3, 0.7);
    }
    if (ctx.sfx) ctx.sfx.impact();
    e.mirCd = MIRROR_CD;
    return;
  }

  e.mirCd = (e.mirCd ?? MIRROR_CD) - a.dt;
  if (e.mirCd > 0 || a.dist > MIRROR_RANGE) return;
  // The rift opens BESIDE the player - offset along their velocity, so it
  // lands where they are drifting toward rather than where they stand. A
  // player holding still is the player it catches; a player who was already
  // moving has half the tell to be elsewhere.
  const ox = p.vel ? p.vel.x : 0;
  const oz = p.vel ? p.vel.z : 0;
  const ol = Math.hypot(ox, oz) || 1;
  const drift = Math.min(3.2, Math.hypot(ox, oz) * 0.6);
  e.mirX = Math.max(-20, Math.min(20, p.pos.x + (ox / ol) * drift + MIRROR_RIFT_R * 0.5));
  e.mirZ = Math.max(-20, Math.min(20, p.pos.z + (oz / ol) * drift + MIRROR_RIFT_R * 0.5));
  e.mirT = MIRROR_TELL;
  e.mirMark = ctx.effects.markAcquire();
  e.flash = 0.16;
}

// A mirror killed mid-rift is holding a telegraph handle, and the mark pool
// is shared with every boss's own warnings - leaked, the pool empties one
// rift at a time. Same contract as the grub's and the turret's.
export function releaseMirror(e) {
  if (e.mirMark >= 0 && e._fx) e._fx.markRelease(e.mirMark);
  e.mirMark = -1;
}

// The glasswing. Three states and a readable loop, built on the weeper's
// shape because the read is the weeper's: a wide orbit, a long drift down
// with a crimson line sweeping the floor beneath, a climb away after the
// drop. The sweep is one long telegraphed line; the answer is to be off the
// arc, and a player who was never on it pays nothing at all.
export function aiGlasswing(e, a) {
  const ctx = a.ctx;
  if (e.wingState === undefined) {
    e.wingState = 'orbit';
    e.wingCd = 1.6 + Math.random() * 1.6;
    e.wingAng = 0;
  }

  if (e.wingState === 'tell') {
    e.wingT -= a.dt;
    e._setEyeAlert(true);
    // Descending through the whole tell - the same read the weeper keeps:
    // everything else in the arena is on the floor, so a thing coming down
    // is the tell that carries at range.
    e.hoverY = WING_HIGH - 1.4;
    e.flyRate = 4;
    a.vx = 0;
    a.vz = 0;
    e.wingAng += WING_SWEEP * a.dt;
    e.faceLocked = true;
    e.group.rotation.y = Math.atan2(-Math.cos(e.wingAng), -Math.sin(e.wingAng));
    if (ctx.effects) {
      _obsidianAt.set(e.pos.x, e.pos.y - 0.35, e.pos.z);
      _obsidianTo.set(
        e.pos.x + Math.cos(e.wingAng) * 30,
        e.pos.y - 0.35,
        e.pos.z + Math.sin(e.wingAng) * 30
      );
      ctx.effects.beam(_obsidianAt, _obsidianTo, OBSIDIAN_EDGE);
    }
    if (e.wingT > 0) return;
    e.wingState = 'climb';
    e.wingT = WING_CLIMB;
    e._setEyeAlert(false);
    // THE DROP, along the swept bearing and nowhere else. The projectile
    // aims at the player by construction; the spread turns that aim onto
    // the line - the shot goes where the line went, not where the player is.
    const p = ctx.player;
    if (p) {
      const base = Math.atan2(p.pos.z - e.pos.z, p.pos.x - e.pos.x);
      ctx.addProjectile(e.pos.x, e.pos.y - 0.2, e.pos.z, 'glasswing', 1, e.wingAng - base);
    }
    _obsidianAt.set(e.pos.x, e.pos.y - 0.2, e.pos.z);
    if (ctx.effects) ctx.effects.burst(_obsidianAt, OBSIDIAN_EDGE, 10, 4, 2, 0.35);
    return;
  }

  if (e.wingState === 'climb') {
    e.wingT -= a.dt;
    e.hoverY = WING_HIGH;
    e.flyRate = 2;
    e.faceLocked = false;
    if (e.wingT <= 0) {
      e.wingState = 'orbit';
      e.wingCd = 2.2 + Math.random() * 1.6;
    }
    return;
  }

  // orbit
  orbit(e, a, ENEMY_TYPES.glasswing.orbit);
  e.hoverY = WING_HIGH;
  e.flyRate = 4;
  e.faceLocked = false;
  e.wingCd -= a.dt;
  const ready = e.wingCd <= 0;
  e._setEyeAlert(ready && a.dist < WING_RANGE);
  if (ready && a.dist < WING_RANGE) {
    e.wingState = 'tell';
    e.wingT = WING_TELL;
    // The sweep starts on the player and drifts - the weeper's contract: a
    // player who stands still is the player the arc crosses, and one who
    // walks with it is the player it misses.
    const p = ctx.player;
    if (p) e.wingAng = Math.atan2(p.pos.z - e.pos.z, p.pos.x - e.pos.x);
  }
}

// ---- the boss ----------------------------------------------------------------

export function aiMirrorboss(e, a) {
  const bs = e.bs;
  const ctx = a.ctx;
  if (bs.state === undefined) {
    bs.state = 'walk';
    bs.t = 0;
    bs.crescentCd = 3.5;
    bs.rainCd = 6;
    bs.wallsCd = 9;
    bs.rainT = 0;
    bs.wallsT = 0;
    bs.mark = -1;
    bs.split = false;
    bs.dirX = 0;
    bs.dirZ = 0;
  }
  // Held so cleanup() can release a telegraph the boss died on top of.
  bs.fx = ctx.effects;

  // THE SEAM, driven every frame: it brightens through the fight and BLAZES
  // when the face splits, so the boss's state is on the boss rather than in
  // anybody's imagination.
  if (bs.seam) {
    const frac = Math.max(0, e.hp / e.maxHp);
    const heat = bs.split ? 1 : Math.max(0, (1 - frac) * 0.6);
    const w = bs.split ? 1.8 : 1 + heat * 0.8;
    bs.seam.scale.x = w * e.scale;
    if (bs.split) bs.seam.scale.y = 2.6 * e.scale;
    bs.seam.material = OBSIDIAN_SEAM;
  }
  if (bs.crescent) {
    bs.crescent.rotation.z += a.dt * 0.5;
  }

  // Standing on it costs, in every state - the shared contract every slow
  // boss keeps (see bossTouch).
  bossTouch(e, a);

  // ---- the enrage: the face splits ----------------------------------------
  if (!bs.split && e.hp <= e.maxHp * MIRRORBOSS_SPLIT_FRAC) {
    bs.split = true;
    // The one attack that is NOT a line: the face comes apart and the whole
    // body opens up. Full damage from here - see the type's armor, which
    // reads bs.split.
    ctx.bossEvent('enrage', e);
    ctx.effects.addShake(0.35);
    _obsidianAt.set(e.pos.x, 1.4, e.pos.z);
    ctx.effects.burst(_obsidianAt, OBSIDIAN_EDGE_BRIGHT, 40, 9, 4, 1.0);
    ctx.effects.shockwave(_obsidianAt, OBSIDIAN_EDGE, 9, 0.6);
    // The split face takes full damage AND the boss comes apart in the
    // tempo of its attacks - the window the whole fight builds to.
    e.rate = e.rate * MIRRORBOSS_SPLIT_RATE;
    bs.crescentCd = Math.min(bs.crescentCd, 2);
    bs.rainCd = Math.min(bs.rainCd, 2);
    bs.wallsCd = Math.min(bs.wallsCd, 2);
  }

  // ---- the crescent: a committed sweep along a telegraphed lane -------------
  if (bs.state === 'crescent-tell') {
    bs.t -= a.dt;
    a.vx = 0;
    a.vz = 0;
    e._setEyeAlert(true);
    // The lane, drawn at full length from the first frame: the AREA reads
    // instantly, the fill reads the timing - the same shape and promise as
    // Siege's charge.
    ctx.effects.markSet(
      bs.mark,
      e.pos.x + bs.dirX * 10, e.pos.z + bs.dirZ * 10,
      2.2, OBSIDIAN_EDGE, 1 - bs.t / MIRRORBOSS_CRESCENT_TELL,
      5.2, Math.atan2(-bs.dirX, -bs.dirZ)
    );
    if (bs.t <= 0) {
      ctx.effects.markRelease(bs.mark);
      bs.mark = -1;
      e._setEyeAlert(false);
      bs.state = 'crescent';
      bs.t = CLAST_LUNGE * 1.1;
      bs.hit = false;
      ctx.bossEvent('charge', e);
    }
    return;
  }

  if (bs.state === 'crescent') {
    bs.t -= a.dt;
    e.stepMul = MIRRORBOSS_CRESCENT_SPEED / Math.max(0.5, a.sp);
    a.vx = bs.dirX * MIRRORBOSS_CRESCENT_SPEED;
    a.vz = bs.dirZ * MIRRORBOSS_CRESCENT_SPEED;
    // The blade's band, wider than the body exactly as the clast's is.
    // BOSS_REACH_Y, not MELEE_REACH_Y: a boss stands far taller than the
    // roster, and its swing has to clear a player jumping off a platform
    // the way every other boss's does.
    if (!bs.hit && a.dist < e.radius + MIRRORBOSS_CRESCENT_REACH
      && Math.abs(ctx.player.pos.y - e.pos.y) < BOSS_REACH_Y) {
      bs.hit = true;
      ctx.onHitPlayer(Math.min(MIRRORBOSS_CRESCENT_CAP, e.damage * 1.4), e.pos, e);
      _obsidianAt.set(e.pos.x, 1.2, e.pos.z);
      ctx.effects.burst(_obsidianAt, OBSIDIAN_EDGE, 24, 7, 3, 0.6);
      ctx.effects.addShake(0.25);
    }
    if (bs.t <= 0 || e.blockedBy > 0.05) {
      const slammed = e.blockedBy > 0.05;
      bs.state = 'recover';
      bs.t = slammed ? 2.2 : 0.6;
      bs.crescentCd = MIRRORBOSS_CRESCENT_CD * e.rate;
      if (slammed) {
        _obsidianAt.set(e.pos.x, 0, e.pos.z);
        ctx.effects.shockwave(_obsidianAt, OBSIDIAN_EDGE, 7, 0.5);
        ctx.effects.burst(_obsidianAt, OBSIDIAN_EDGE_BRIGHT, 30, 8, 3, 0.8);
        ctx.effects.addShake(0.3);
        // Baiting the sweep into a pillar is the same bargain Siege and
        // Colossus offer: a long window on a boss that is otherwise walking
        // at you the whole fight.
        ctx.bossEvent('stagger', e);
      }
    }
    return;
  }

  // ---- the rain: three circles, telegraphed ----------------------------------
  if (bs.state === 'rain') {
    bs.t -= a.dt;
    a.vx = 0;
    a.vz = 0;
    e._setEyeAlert(true);
    if (bs.t <= 0) {
      e._setEyeAlert(false);
      bs.state = 'walk';
      bs.rainCd = MIRRORBOSS_RAIN_CD * e.rate;
    }
    return;
  }

  // ---- the walls: two blades either side of the player -----------------------
  if (bs.state === 'walls') {
    bs.t -= a.dt;
    a.vx = 0;
    a.vz = 0;
    e._setEyeAlert(true);
    ctx.effects.markSet(
      bs.mark, e.pos.x, e.pos.z, MIRRORBOSS_WALL_OFF + 1.2,
      OBSIDIAN_EDGE, 1 - bs.t / MIRRORBOSS_WALL_TELL, 1, 0, 0.4
    );
    if (bs.t <= 0) {
      ctx.effects.markRelease(bs.mark);
      bs.mark = -1;
      e._setEyeAlert(false);
      bs.state = 'walk';
      bs.wallsCd = MIRRORBOSS_WALLS_CD * e.rate;
      // The two walls go down either side of where the player STOOD at the
      // moment the tell began - locked like every other telegraph in the
      // game, so the lane between them is the answer that was offered.
      for (const side of [-1, 1]) {
        const ang = bs.wallAng + (side * Math.PI) / 2;
        ctx.addHazard(
          bs.wallX + Math.cos(ang) * MIRRORBOSS_WALL_OFF,
          bs.wallZ + Math.sin(ang) * MIRRORBOSS_WALL_OFF,
          MIRRORBOSS_WALL_R, MIRRORBOSS_WALL_LIFE, 0, 'edge'
        );
      }
      _obsidianAt.set(bs.wallX, 0.2, bs.wallZ);
      ctx.effects.shockwave(_obsidianAt, OBSIDIAN_EDGE, MIRRORBOSS_WALL_OFF + 2, 0.4);
      ctx.effects.addShake(0.2);
      if (ctx.sfx) ctx.sfx.impact();
    }
    return;
  }

  // ---- recover / walk: closing and swinging ----------------------------------
  if (bs.state === 'recover') {
    e.stepMul = 1.4;
    bs.t -= a.dt;
    if (bs.t <= 0) {
      bs.state = 'walk';
      ctx.bossEvent('recover', e);
    }
    return;
  }

  // Terror does not send a boss running - the stagger contract the other
  // bosses keep.
  if (e.status.fear > 0) {
    e._setEyeAlert(false);
    return;
  }

  e.stepMul = 1.4;
  const m = ENEMY_TYPES.mirrorboss.melee;
  const free = e._meleeCycle(a.dt, a.dist, ctx, m.windup, m.start, m.hit, m.cd);
  if (free) {
    a.vx = a.px * a.sp;
    a.vz = a.pz * a.sp;
  }
  // Nothing below may interrupt a swing already wound up or live.
  if (!free) return;

  // THE CRESCENT, from mid-range. The heading is locked at the telegraph,
  // not tracked through it - the whole counter-play, same as Siege's.
  bs.crescentCd -= a.dt;
  if (bs.crescentCd <= 0 && a.dist > 6 && a.dist < 30) {
    bs.state = 'crescent-tell';
    bs.t = MIRRORBOSS_CRESCENT_TELL;
    bs.mark = ctx.effects.markAcquire();
    bs.dirX = a.nx;
    bs.dirZ = a.nz;
    return;
  }

  // THE RAIN, from anywhere. Three circles around where the player is
  // standing at the moment it is called - the mortar system telegraphs
  // every one of them, and the answer is the same as every mortar's: be
  // elsewhere when they fill.
  bs.rainCd -= a.dt;
  if (bs.rainCd <= 0) {
    bs.state = 'rain';
    bs.t = MIRRORBOSS_RAIN_DELAY + 0.3;
    const p = ctx.player;
    const p0 = { x: p.pos.x, z: p.pos.z };
    for (let i = 0; i < MIRRORBOSS_RAIN_N; i++) {
      const ang = Math.random() * Math.PI * 2;
      const rad = 1.5 + Math.random() * 3.5;
      ctx.addMortar(
        Math.max(-20, Math.min(20, p0.x + Math.cos(ang) * rad)),
        Math.max(-20, Math.min(20, p0.z + Math.sin(ang) * rad)),
        MIRRORBOSS_RAIN_R, MIRRORBOSS_RAIN_DELAY, MIRRORBOSS_RAIN_DMG
      );
    }
    return;
  }

  // THE WALLS, when the player is standing still enough to be bracketed.
  bs.wallsCd -= a.dt;
  if (bs.wallsCd <= 0 && a.dist < 26) {
    bs.state = 'walls';
    bs.t = MIRRORBOSS_WALL_TELL;
    bs.mark = ctx.effects.markAcquire();
    const p = ctx.player;
    bs.wallX = p.pos.x;
    bs.wallZ = p.pos.z;
    // The axis is locked to the player's own heading at the moment of the
    // call, so the walls land across the lane they are using - the knapper
    // question at boss scale. A STILL player gets them across whichever way
    // the boss is approaching from, so the open lane never points straight
    // at the blade coming down it.
    const vx = p.vel ? p.vel.x : 0;
    const vz = p.vel ? p.vel.z : 0;
    bs.wallAng = (vx === 0 && vz === 0)
      ? Math.atan2(e.pos.z - p.pos.z, e.pos.x - p.pos.x)
      : Math.atan2(vz, vx);
    return;
  }
}

const TYPES = {
  // ---- OBSIDIAN --------------------------------------------------------------
  //
  // The theme of EDGES. Six enemies and a boss, every one of them dark glass
  // carrying one hot cutting line, and every one of them asking the same
  // question at a different range: where is the edge about to be?

  // A rusher that commits. From mid-range it locks a heading and lunges -
  // a straight line it cannot steer, with the blade's band sweeping wide of
  // the body. The question is the LINE, and the answer is one step off it.
  clast: {
    head: { r: 0.28, y: 1.16 },
    hp: 42, speed: 3.1, damage: 9, value: 200, color: 0x241a30, eye: 0xff8a80,
    scale: 1.0, radius: 0.48, mass: 1,
    melee: { windup: 0.42, start: 1.5, hit: 2.1, cd: 1.2 },
    build: buildClast, ai: aiClast,
  },

  // A gunner that fires a simultaneous wall of three HOMING needles. The
  // wall turns slowly toward the player, so the dodge is a step across its
  // line rather than a sprint away from the enemy - and each needle can be
  // shot out of the air, because a wall that followed you AND could not be
  // answered would be the one thing in the game with no counter at all.
  lancet: {
    head: { r: 0.28, y: 1.34 },
    hp: 26, speed: 2.3, damage: 8, value: 250, color: 0x2a2038, eye: 0xff8a80,
    scale: 1.0, radius: 0.46, mass: 1,
    orbit: { dist: 12, band: 2.5, out: 0.8, in: -0.65, strafe: 0.45, flip: 1.8, flipVar: 2 },
    proj: {
      core: 0xff8a80, glow: 0xff3b30, scale: 0.55,
      speed: [15, 0.25, 21], dmg: [7, 0.3, 12],
      // The slow home is the whole enemy - see LANCET_HOME. Slow enough that
      // crossing the wall's line still beats it; fast enough that standing
      // still does not.
      home: LANCET_HOME,
      // Shootable, like the angler's bubbles: a round that follows you has
      // to be answerable with a bullet as well as with a step, or the only
      // answer is never being seen.
      shootable: true,
    },
    build: buildLancet, ai: aiLancet,
  },

  // A brute of dark glass with a cooled shell at the front and a burning
  // heart in the gap. The shell eats most of what lands on it; the heart is
  // full price, and it is where the aim goes. Damage over time ignores the
  // shell entirely - what seeps is not stopped by one, the bulwark's own
  // rule.
  maser: {
    head: { r: 0.3, y: 0.58 },
    hp: 150, speed: 1.55, damage: 16, value: 300, color: 0x221a2e, eye: 0xff8a80,
    scale: 1.35, radius: 0.62, mass: 2,
    melee: { windup: 0.7, start: 2.8, hit: 3.4, cd: 2.2 },
    // DIRECTIONAL, like the borer's: the maser closes head-first and the
    // group faces the player throughout, so the facing IS the shell's
    // position.
    armor: (e, dirX, dirZ, point) => {
      const yaw = e.group.rotation.y;
      const fx = -Math.sin(yaw);
      const fz = -Math.cos(yaw);
      if (point) {
        const hx = point.x - e.pos.x;
        const hz = point.z - e.pos.z;
        const hl = Math.hypot(hx, hz) || 1;
        return (hx * fx + hz * fz) / hl > 0 ? MASER_SHELL_ARMOR : 1;
      }
      return dirX * fx + dirZ * fz < 0 ? MASER_SHELL_ARMOR : 1;
    },
    // And the abdomen's answer is the honest one, the borer's rule: the
    // shell does not stop what seeps.
    armorDefault: 1,
    build: buildMaser, ai: aiMaser,
  },

  // The only artillery in the game whose landing is a WALL: it strikes a
  // blade of solid obsidian out of the floor, aimed ahead of where the player
  // is going, that stands for three seconds. Whether that cover is yours or
  // theirs depends entirely on where you were going - the vent's question
  // asked with the knapper's answer.
  knapper: {
    head: { r: 0.3, y: 1.1 },
    hp: 46, speed: 1.9, damage: 0, value: 280, color: 0x282036, eye: 0xff8a80,
    scale: 1.15, radius: 0.54, mass: 1,
    orbit: { dist: 15, band: 2.5, out: 0.65, in: -0.5, strafe: 0.3, flip: 2.4, flipVar: 2 },
    build: buildKnapper, ai: aiKnapper,
  },

  // No projectile and no swing. It opens a RIFT beside the player - a
  // growing pulsing area that swells for a full second and then cuts. The
  // answer is to move NOW; the tell is the pulse itself, and a player who
  // was already moving has half the tell to be elsewhere. The only support
  // in the game whose pressure is a PLACE rather than a buff.
  mirror: {
    head: { r: 0.28, y: 0.94 },
    hp: 62, speed: 2.1, damage: 0, value: 330, color: 0x1e1628, eye: 0xff8a80,
    scale: 1.15, radius: 0.5, mass: 1,
    orbit: { dist: 12, band: 2, out: 0.8, in: -0.6, strafe: 0.3, flip: 2, flipVar: 2 },
    build: buildMirror, ai: aiMirror, cleanup: releaseMirror,
  },

  // The high line. It holds a wide orbit, drifts down, and sweeps a thin
  // crimson arc across the floor for over a second before dropping a glass
  // shard along it - the weeper's read with an edge's promise: the line
  // tells you exactly where not to be, and off it costs nothing at all.
  glasswing: {
    head: { r: 0.28, y: 0.8 },
    hp: 52, speed: 3.4, damage: 12, value: 300, color: 0x2c2238, eye: 0xff8a80,
    scale: 1.1, radius: 0.5, mass: 1,
    fly: { height: WING_HIGH },
    hitbox: { r: 0.6, y: 0.55 },
    orbit: { dist: 17, band: 2.5, out: 0.8, in: -0.6, strafe: 0.3, flip: 2.4, flipVar: 2 },
    proj: {
      core: 0xff8a80, glow: 0xff3b30, scale: 0.85,
      speed: [26, 0.4, 34], dmg: [11, 0.45, 18],
    },
    build: buildGlasswing, ai: aiGlasswing,
  },

  // THE SMOKING MIRROR, OBSIDIAN's boss. A cracked slab of volcanic glass
  // standing on end, dragging itself about on three heavy legs, and every
  // attack it has draws a line across the room:
  //
  //   the CRESCENT  a telegraphed lane, then a committed sweep down it -
  //                 the clast's lunge at boss scale, and baitable into a
  //                 pillar for the same long window Siege offers
  //   the RAIN      three telegraphed circles around the player at once -
  //                 the widest question it asks, and the only area
  //   the WALLS     two solid blades out of the floor, one either side of
  //                 the lane the player is using - the knapper doubled, and
  //                 the lane between them is the answer that was offered
  //
  // Under a third of the bar the FACE SPLITS: the seam blazes open, every
  // attack comes twice as often, and the open face takes FULL damage where
  // the shut face eats a third of it. The last third of the fight is the
  // window the whole fight was building to.
  mirrorboss: {
    head: { r: 0.42, y: 1.6 },
    hp: 3200, speed: 2.5, damage: 24, value: 6000, color: 0x1c1622, eye: 0xff8a80,
    scale: 2.7, radius: 1.5, mass: 8, boss: true,
    hitbox: { r: 0.72, y: 1.1 },
    statusMul: 0.3, freezeSlow: true, slowFactor: 0.75, freezeVuln: 1.0,
    entropyExempt: true, fearMode: 'stagger',
    melee: { windup: 0.6, start: 3.4, hit: 4.2, cd: 1.8 },
    // The shut face is ARMOUR; the split face is the window. Reads bs.split,
    // the same state the seam's blaze and the enrage banner agree on - the
    // three must never disagree, the colossus lesson.
    armor: (e) => (e.bs.split ? 1 : MIRRORBOSS_SPLIT_ARMOR),
    armorDefault: (e) => (e.bs.split ? 1 : MIRRORBOSS_SPLIT_ARMOR),
    build: buildMirrorboss, ai: aiMirrorboss, cleanup: releaseMarks,
  },
};

Object.assign(ENEMY_TYPES, TYPES);
