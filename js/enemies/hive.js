// HIVE's six enemies and its boss.
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
  BOSS_REACH_Y, ENEMY_TYPES, FLY_RATE_DEFAULT, MELEE_REACH_Y, SHARED_MATS,
  _blinkAt, _reachY, aiMelee, bossTouch, eyes, landHit, lump, orbit, partsFor,
  prism, releaseMarks, rock, shard, slab, spike,
} from './shared.js';

// ---- HIVE -----------------------------------------------------------------
// The theme of the SWARM, and the one idea every number below serves: NO BODY
// IN THIS THEME IS THE THREAT ON ITS OWN. A drone alone is the slowest rusher
// in the game. A spitter's single dart is the weakest round. A soldier swings
// like any brute. What each of them is FOR is the colony - what a drone is
// standing next to, what a nurse is feeding, how many the queen has hatched -
// and the player's job in a HIVE block is the reverse of every other theme's:
// not "which body do I shoot first" but "which body do I shoot to make the
// REST of them weaker".
//
// WHERE EMBER SPENDS FLOOR and RIME SPENDS THE PLAYER, this spends ORGANIZATION.
// Almost every constant below is about something TWO enemies are doing to each
// other - a radius a buff reaches, a pulse every spitter in the room fires on
// together, a cap on how many bodies one queen may put on the field - which is
// why so few of them are about the player at all.
//
// THE SHARED SILHOUETTE IS THE CARAPACE. Every one of these is a dark
// segmented body in plates - thorax and abdomen pulled apart by the WASP WAIST
// that no other theme has, so the family reads as insects at any distance -
// with exactly ONE amber seam lit on each of them. The seam is the part that
// does the thing (a drone's waist, a spitter's throat, a nurse's core) and it
// is the one part that keeps its colour under a status tint, so a poisoned
// hive enemy still reads as a hive enemy.
//
// THREE RULES THE SWARM OBEYS, and they are what stop six coordination
// mechanics from being six invisible taxes:
//
//   1. THE LINK IS DRAWN. A nurse hasting a brooder draws the beam, exactly as
//      a conduit and a bellows do - a buff the player cannot see is a wave
//      that is quietly wrong, and the whole answer to this theme is finding
//      the body the link comes from.
//   2. THE SWARM TELEGRAPHS AS ONE. The spitters all fire on the same
//      half-beat, which means the volley arrives as a wall and the beat
//      between walls is the player's. A swarm that fired at random would be
//      noise; a swarm on the music is a rhythm you can stand inside.
//   3. NOTHING SPAWNS ON THE PLAYER. The queen hatches her brood on a ring
//      well clear of wherever the player is standing - a drone arriving under
//      their feet would break the one promise the whole game makes about
//      spawns, and a boss is not exempt from it.

// The drone's pack. THE PACK IS THE SPEED: a drone's legs are worth almost
// nothing and the cloud it moves in is worth everything, so the counterplay is
// to break the cloud - kill the outliers and the wave slows down in front of
// the player.
//
// Counted on ANY living ally, not hive ones: during a HIVE block the field is
// hive anyway, and a rule keyed on theme would quietly stop working the day a
// companion or a deployed ally stood among them.
export const DRONE_PACK_R = 4;

export const DRONE_PACK_STEP = 0.15;

// THREE, and the cap is as high as it is on purpose: it is the difference
// between the slowest rusher in the game and one of the fastest, which is the
// whole enemy. Above three the crowd stops reading as "more of them" and
// starts reading as "one of them is in fast-forward".
export const DRONE_PACK_CAP = 3;

// The spitter's volley. ON THE PULSE, never on a clock of its own: every
// spitter in the room fires on the same half-beat, so the darts arrive as one
// wall rather than as a drizzle, and the gap between walls is the player's
// half-second. Nothing rhythmic in this game runs on a private timer - see the
// note on the kiln in upgrades.js.
//
// SIX half-beats between walls: three seconds at the soundtrack's tempo, which
// is a whole bar of the track between volleys and enough room to be a rhythm
// rather than a pressure.
export const SPIT_PERIOD = 6;

export const SPIT_DARTS = 3;

// Wide enough that the fan covers a strafing player at mid range and no wider:
// a fan the player cannot step out of would be a wall, and this is a wave.
export const SPIT_SPREAD = 0.11;

export const SPIT_RANGE = 26;

// The soldier's sting. THE SHOVE IS THE ATTACK: a brute's job is to make you
// leave, and this one takes your POSITION rather than your health - it plants
// you wherever the sting put you, which in this theme is in among the drones.
// The wind-up is the whole counterplay, exactly as the thornling's and the
// gulper's are: a shove that tracked would be a displacement tax, not an
// attack.
export const SOLD_WINDUP = 0.65;

export const SOLD_STAB_TIME = 0.8;

export const SOLD_STAB_MUL = 3.8;

// The band the sting is offered in. It has to reach from further out than the
// swing or the wind-up would never be seen, and no further than the lunge can
// actually close in its own time - a telegraph that cannot connect is a
// countdown, not a threat.
export const SOLD_STAB_MIN = 2.6;

export const SOLD_STAB_MAX = 7.5;

export const SOLD_STAB_CAP = 26;

export const SOLD_CD = 4.5;

// THE SHOVE IS A GUST, not an impulse. pullPlayer writes a velocity into the
// player's NEXT frame only, so a single call displaces them a few centimetres
// and reads as a stutter - the squall's charge for this exact reason. The push
// runs for the whole stab, aimed down the frozen heading, and the heading is
// kept rather than re-read off the player so a shove that followed them would
// not be a shove at all.
export const SOLD_PUSH = 5.2;

export const SOLD_PUSH_TIME = 0.4;

// The brooder's eggs. THREE CIRCLES, NOT ONE: the sporegun's seed is a single
// filling circle, and where VERDANT's question is "be off that spot" this one
// is "be off that NEST" - three overlapping marks that read as a cluster of
// eggs rather than one big egg, so the answer is the same but the shape on the
// floor is this theme's own.
export const EGG_RADIUS = 1.7;

export const EGG_HATCH = 1.7;

export const EGG_DAMAGE = 10;

export const EGG_CLUSTER = 3;

export const EGG_CLUSTER_SPREAD = 1.15;

export const BROOD_CD = 4.4;

export const BROOD_RANGE = 22;

// The nurse's feeding. It does not heal and it does not shield - it makes the
// wave FASTER, by paying down the cooldowns of everything it is standing near.
// The conduit makes the crowd tougher to kill and this makes it quicker to
// act; both are answered by shooting the thing with the beams coming out of
// it, and both are deliberately priced so that the answer is the same one.
export const NURSE_RANGE = 8;

export const NURSE_LINKS = 3;

// How many seconds of cooldown it eats per second of standing there. Under one
// would read as nothing over the noise of the cooldowns' own random tails;
// much over two and a fed brooder would lay eggs faster than the mortar pool
// could hold them.
export const NURSE_RATE = 0.9;

// The wasp's pass. It does not hover and it does not dive - it makes PASSES,
// the way a wasp actually hunts: a wide orbit, a rear-up aimed at where the
// player is standing, then a shallow run THROUGH that spot at a speed nothing
// else on the floor can match for the second it lasts. The pass is aimed at
// the ground the player was ON when the tell ended, never at the player, so
// the whole enemy is answered by being elsewhere by the time it arrives - the
// same contract the shrike's dive and the ashwing's run keep.
export const WASP_HIGH = 4.4;

export const WASP_PASS_Y = 1.1;

export const WASP_TELL = 0.7;

// THE PASS HAS TO OUT-REACH THE STANDOFF, or the wasp rears from a range its
// own run cannot cross and lands short every time - a committed pass that
// stops in front of the player is a tell with nothing behind it. The run
// covers speed x WASP_PASS_MUL x this, and that product has to clear the
// standoff with room to come out the FAR SIDE: 3.6 x 3 x 1.45 is roughly
// sixteen metres against an eleven metre orbit, which is the player's spot
// plus the overshoot that makes the pass read as a pass.
export const WASP_PASS_TIME = 1.45;

export const WASP_PASS_MUL = 3.0;

// The orbit it waits on, and the distance the pass above is sized against -
// the two numbers are one decision and neither moves alone.
export const WASP_STANDOFF = 11;

export const WASP_CD = 3.2;

export const WASP_CLIMB = 1.2;

export const WASP_HIT_R = 1.6;

// THE STING IS THE POISON, not the hit. Four seconds of it at the status
// table's four a second: sixteen points spread thin, for a contact that on
// its own is worth almost nothing - the same trade the cinder makes with fire.
export const WASP_POISON = 4;

// Scratch for the amber bursts. Module-level and consumed immediately, like
// every other vector in this family of files.
export const _hiveAt = new THREE.Vector3();

// Small, forward-leaning, and PINCHED AT THE WAIST - the wasp waist is the
// family's signature and the drone carries it most literally, because the
// drone is the family's baseline body. Wings swept back and up so the
// silhouette from the front is all lean.
export function buildDrone(e, g, s) {
  const P = partsFor(e, g, s);
  // The lean. Everything above the hips is pushed forward of everything below
  // it, which is what says "this one runs" before it has taken a step.
  P('droneTorso', prism(0.3, 0.24, 0.5, 5), { y: 0.86, z: -0.06, rx: -0.22 });
  P('droneHead', shard(0.15), { y: 1.08, z: -0.28, sz: 1.1 });
  // THE WAIST. Narrow, dark, and lit - the one amber seam, and the part the
  // pack is supposed to be read off: a drone in a cloud is a drone whose
  // waist you can see pulsing, so the speed has a place on the body.
  e.waistMesh = P('droneWaist', prism(0.09, 0.12, 0.24, 5), {
    y: 0.72, z: 0.1, rx: -0.3, mat: SHARED_MATS.hiveAmber, shadow: false,
  });
  // The abdomen, long and rising away behind the waist.
  P('droneAbdomen', prism(0.16, 0.26, 0.62, 5), {
    y: 0.78, z: 0.42, rx: 0.42, mat: SHARED_MATS.hiveChitin,
  });
  // THE STING on the abdomen's tip: small, because a drone does not sting -
  // it arrives - but the family reads as wasps and the tail is why.
  P('droneSting', spike(0.05, 0.24, 4), {
    y: 0.94, z: 0.74, rx: 0.42 + Math.PI, mat: SHARED_MATS.hiveChitin,
  });
  // Wings: two thin planes swept back and V-ed, on the dark chitin so they
  // read as structure against the lit waist rather than as two more lights.
  const wingGeo = slab(0.5, 0.03, 0.2);
  P('droneWing', wingGeo, { x: -0.24, y: 1.02, z: 0.16, rz: 0.5, ry: 0.5, mat: SHARED_MATS.hiveChitin, shadow: false });
  P('droneWing', wingGeo, { x: 0.24, y: 1.02, z: 0.16, rz: -0.5, ry: -0.5, mat: SHARED_MATS.hiveChitin, shadow: false });
  // Legs under it, sprung forward.
  P('droneLeg', slab(0.07, 0.36, 0.08), { x: -0.14, y: 0.34, z: 0.02, rx: 0.28 });
  P('droneLeg', slab(0.07, 0.36, 0.08), { x: 0.14, y: 0.34, z: 0.02, rx: 0.28 });
  P('droneFoot', slab(0.09, 0.1, 0.18), { x: -0.16, y: 0.1, z: -0.04 });
  P('droneFoot', slab(0.09, 0.1, 0.18), { x: 0.16, y: 0.1, z: -0.04 });
  eyes(P, { y: 1.1, x: 0.08, z: -0.38, r: 0.8, mat: e.eyeMat });
}

// Upright and thin, with the whole head carried forward into a PROBOSCIS -
// the gunner read, in this theme's vocabulary. The throat is the lit seam and
// it swells on the half-beat before the volley, so a room full of spitters
// rears together and the player can read the wall before it is in the air.
export function buildSpitter(e, g, s) {
  const P = partsFor(e, g, s);
  P('spitTorso', prism(0.22, 0.16, 0.66, 5), { y: 1.0, rx: -0.06 });
  P('spitCollar', prism(0.28, 0.24, 0.1, 5), { y: 1.32 });
  // THE HEAD, hung forward of the collar so the proboscis has somewhere to
  // come from. Bulbous where the drone's is a sliver - it is all throat.
  P('spitHead', lump(0.2), { y: 1.44, z: -0.08, sy: 0.85 });
  // THE PROBOSCIS. Long, thin, level, and the only part that projects past
  // the body - from the side the outline is a cross, and from the front the
  // darts have an obvious home.
  P('spitSnout', prism(0.05, 0.09, 0.5, 5), {
    y: 1.42, z: -0.44, rx: Math.PI / 2, mat: SHARED_MATS.hiveChitin,
  });
  // THE THROAT, lit and animated by aiSpitter as the volley's tell.
  e.spitThroat = P('spitThroat', shard(0.13), {
    y: 1.44, z: -0.2, sz: 0.7, mat: SHARED_MATS.hiveAmber, shadow: false,
  });
  // A small abdomen slung behind, for the waist - every type in the family
  // has one, and the gunner's is the smallest because it is carrying the
  // least.
  P('spitAbdomen', prism(0.13, 0.2, 0.4, 5), {
    y: 0.9, z: 0.32, rx: 0.5, mat: SHARED_MATS.hiveChitin,
  });
  // Wings folded back, closer to the body than a drone's - it holds station
  // to shoot, it does not run anything down.
  const wingGeo = slab(0.34, 0.03, 0.16);
  P('spitWing', wingGeo, { x: -0.18, y: 1.16, z: 0.2, rz: 0.55, mat: SHARED_MATS.hiveChitin, shadow: false });
  P('spitWing', wingGeo, { x: 0.18, y: 1.16, z: 0.2, rz: -0.55, mat: SHARED_MATS.hiveChitin, shadow: false });
  // Two thin legs, planted wide enough that the thin body does not read as
  // fragile - it is not, and the family is not.
  P('spitLeg', slab(0.08, 0.52, 0.08), { x: -0.12, y: 0.28 });
  P('spitLeg', slab(0.08, 0.52, 0.08), { x: 0.12, y: 0.28 });
  eyes(P, { y: 1.48, x: 0.09, z: -0.2, r: 0.8, mat: e.eyeMat });
}

// Wide, planted, and all jaw. The brute read is top-heavy and thick-legged in
// every theme; here the mass is carried FORWARD into a pair of mandibles that
// are the outline - a soldier is a set of pincers with a body behind them, and
// the sting it is known for never comes from them, which is the joke of the
// model: the wind-up looks like a bite and the hit is a shove.
export function buildSoldier(e, g, s) {
  const P = partsFor(e, g, s);
  // The body: low, wide, and deep-chested rather than tall. A soldier should
  // look like it could hold ground against the shove of its own stab.
  P('soldTorso', prism(0.42, 0.34, 0.62, 5), { y: 0.82, z: 0.04 });
  P('soldChest', prism(0.36, 0.44, 0.22, 5), { y: 1.02, z: -0.3, rx: -0.25 });
  // THE MANDIBLES. Two long slabs driven forward from the shoulders, open a
  // little, hinged outboard of the eyes - they are the widest thing on the
  // model and the tallest at the front, so the silhouette from the player's
  // angle is a pincer closing.
  const jawGeo = slab(0.13, 0.62, 0.16);
  e.jawL = P('soldJaw', jawGeo, { x: -0.3, y: 0.94, z: -0.44, rz: 0.42, rx: 1.35 });
  e.jawR = P('soldJaw', jawGeo, { x: 0.3, y: 0.94, z: -0.44, rz: -0.42, rx: 1.35 });
  // The jaw ROOTS, lit: where the muscle is, and the part that swells when
  // the stab is winding up.
  e.jawRoot = P('soldJawRoot', shard(0.14), {
    y: 0.98, z: -0.22, mat: SHARED_MATS.hiveAmber, shadow: false,
  });
  // Head sunk between the mandibles - small on purpose, so the jaws are the
  // face.
  P('soldHead', shard(0.16), { y: 1.06, z: -0.26, sz: 0.9 });
  // The waist and abdomen, lower and further back than the drone's: the same
  // two parts, weighted like a plough rather than a runner.
  P('soldWaist', prism(0.12, 0.16, 0.26, 5), {
    y: 0.62, z: 0.42, rx: -0.35, mat: SHARED_MATS.hiveAmber, shadow: false,
  });
  P('soldAbdomen', prism(0.26, 0.4, 0.6, 5), {
    y: 0.66, z: 0.78, rx: 0.55, mat: SHARED_MATS.hiveChitin,
  });
  // Four heavy legs, splayed, planted.
  for (const [x, z, ry] of [[-0.34, -0.14, 0.4], [0.34, -0.14, -0.4], [-0.3, 0.32, 0.65], [0.3, 0.32, -0.65]]) {
    P('soldLeg', slab(0.13, 0.5, 0.14), { x, y: 0.26, z, ry });
  }
  eyes(P, { y: 1.1, x: 0.1, z: -0.4, r: 0.9, mat: e.eyeMat });
}

// Bloated and bottom-heavy, with the load riding high on its back - the
// ground-denier read the hailer and the blight share, in this theme's body.
// The eggs it is carrying are the only thing on it that is not chitin, and
// they are what it throws, so the tell and the payload are one object.
export function buildBrooder(e, g, s) {
  const P = partsFor(e, g, s);
  // The grub body: one fat mass, wider at the floor than at the shoulders,
  // with no waist at all. It is the one type in the family that has lost the
  // insect outline - it is the LARVA the rest of them came from.
  P('broodBody', lump(0.52), { y: 0.42, sy: 0.82, sx: 1.12, sz: 1.18 });
  P('broodShoulder', prism(0.4, 0.3, 0.3, 5), { y: 0.78, z: -0.1, rx: -0.2 });
  P('broodHead', shard(0.17), { y: 0.94, z: -0.42, sz: 0.95 });
  // THE CLUTCH. Three eggs riding high on the back, pale and slightly
  // translucent - the hailer's cluster in the same place, and the whole tell:
  // a brooder visibly carrying what it is about to put under the player.
  const eggGeo = shard(0.16);
  P('broodEgg', eggGeo, { x: -0.2, y: 1.0, z: 0.22, sy: 1.2, mat: SHARED_MATS.hiveAmber, shadow: false });
  P('broodEgg', eggGeo, { x: 0.22, y: 1.06, z: 0.14, sy: 1.3, s: 0.9, mat: SHARED_MATS.hiveAmber, shadow: false });
  P('broodEgg', eggGeo, { x: 0, y: 1.14, z: 0.36, sy: 1.1, s: 0.8, mat: SHARED_MATS.hiveAmber, shadow: false });
  // A throwing limb cocked back over the clutch, and a small proboscis so the
  // lob has a place it leaves from.
  P('broodArm', slab(0.12, 0.5, 0.12), { x: 0.4, y: 0.72, z: 0.24, rz: -0.55, rx: 0.35 });
  P('broodSnout', prism(0.05, 0.08, 0.32, 5), {
    y: 0.9, z: -0.6, rx: Math.PI / 2, mat: SHARED_MATS.hiveChitin,
  });
  // Barely legs: four stubs, splayed, that keep the mass off the floor and
  // nothing more.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    P('broodLeg', slab(0.1, 0.22, 0.1), {
      x: Math.cos(a) * 0.42, y: 0.11, z: Math.sin(a) * 0.4,
      rz: -Math.cos(a) * 0.6, rx: Math.sin(a) * 0.6,
    });
  }
  eyes(P, { y: 0.98, x: 0.09, z: -0.52, r: 0.8, mat: e.eyeMat });
}

// Floating, legless and symmetrical - the support read, in this theme's
// materials. A ring of honeycomb cells turning slowly around a suspended
// core: nothing about it says it can fight, and everything about it says the
// things around it are being fed.
export function buildNurse(e, g, s) {
  const P = partsFor(e, g, s);
  // THE CORE, lit and the only amber that pulses: a drop of honey hanging in
  // the middle of the comb. Animated by aiNurse with the feeding.
  e.nurseCore = P('nurseCore', shard(0.17), {
    y: 1.06, sy: 1.25, mat: SHARED_MATS.hiveAmber, shadow: false,
  });
  // THE COMB. Six hexagonal cells stood on a ring, each turned flat-side out,
  // collected on the enemy so the ai can walk them round the core - the whole
  // enemy is the one slow orbit, and a static comb would be a plate.
  const cellGeo = prism(0.16, 0.16, 0.26, 6);
  e.combCells = [];
  for (let i = 0; i < 6; i++) {
    const m = P('nurseCell', cellGeo, {
      x: Math.cos((i / 6) * Math.PI * 2) * 0.5,
      y: 1.06,
      z: Math.sin((i / 6) * Math.PI * 2) * 0.5,
      ry: (i / 6) * Math.PI * 2,
    });
    e.combCells.push({ mesh: m, a: (i / 6) * Math.PI * 2 });
  }
  // Struts above and below the ring, so the comb reads as mounted - the same
  // trick the hoarfrost's spikes pull.
  P('nurseCrown', spike(0.12, 0.4, 4), { y: 1.44 });
  P('nurseStem', spike(0.1, 0.32, 4), { y: 0.72, rx: Math.PI });
  // Nothing below the stem: the silhouette has to have AIR under it or it
  // stops reading as support.
  eyes(P, { y: 1.06, x: 0.08, z: -0.2, r: 0.75, mat: e.eyeMat });
}

// A flat swept body read against the CEILING, like every flier - and this one
// is the family's wasp at its purest: two long delta wings, a narrow thorax,
// and a TAIL that is half the silhouette's length. The lit part is the
// underside, where this theme joins the harrier's and the sleet's rule that
// "it is in the air" reads before the shape does.
export function buildWasp(e, g, s) {
  const P = partsFor(e, g, s);
  // The body: narrow and long, pointing -z like everything else in the roster
  // when it is facing the player.
  P('waspThorax', prism(0.14, 0.18, 0.5, 5), { y: 0.06, z: -0.1 });
  P('waspHead', shard(0.12), { y: 0.06, z: -0.44, sz: 0.8 });
  // THE TAIL. Two segments and a sting, and it is the part the player sees
  // last as the pass goes over them - the wasp's whole character is that its
  // back end is a weapon.
  P('waspWaist', prism(0.07, 0.1, 0.3, 5), {
    y: 0.06, z: 0.32, mat: SHARED_MATS.hiveAmber, shadow: false,
  });
  P('waspAbdomen', prism(0.13, 0.08, 0.44, 5), {
    y: 0.06, z: 0.6, mat: SHARED_MATS.hiveChitin,
  });
  P('waspSting', spike(0.05, 0.42, 4), {
    y: 0.06, z: 0.94, rx: Math.PI / 2, mat: SHARED_MATS.hiveChitin,
  });
  // THE WINGS. Long, thin, swept back and V-ed - from directly below the
  // outline is a chevron, which is what tells it from the ashwing's flat
  // triangle and the sleet's disc in the half-second the player has.
  const wingGeo = slab(0.66, 0.03, 0.24);
  P('waspWing', wingGeo, { x: -0.34, y: 0.12, z: 0.08, rz: 0.36, ry: 0.6, mat: SHARED_MATS.hiveChitin, shadow: false });
  P('waspWing', wingGeo, { x: 0.34, y: 0.12, z: 0.08, rz: -0.36, ry: -0.6, mat: SHARED_MATS.hiveChitin, shadow: false });
  // THE LIT UNDERSIDE - the flier's family rule, in amber.
  P('waspGlow', shard(0.13), {
    y: -0.08, z: -0.04, sy: 0.6, mat: SHARED_MATS.hiveAmber, shadow: false,
  });
  eyes(P, { y: 0.06, x: 0.08, z: -0.52, r: 0.8, mat: e.eyeMat });
}

// THE BROOD QUEEN. The theme's language at boss scale - thorax, waist, plated
// abdomen - plus the three things no ordinary HIVE enemy has: a stinger
// carried BEFORE her like a lance (the charge's leading edge, so the lane
// telegraph and the thing that runs down it are one object), an egg sac lit
// from inside (which pulses as a hatch comes due, so the player can see the
// brood coming before the circles appear), and THREE SETS OF PLATES that
// come off across the fight. The sets are the armour: what the player is
// whittling when the bar moves is the shell, and each time a set goes she is
// faster, barer, and under more of her own pressure.
export function buildBroodQueen(e, g, s) {
  const P = partsFor(e, g, s);
  // The thorax: big, banded, deep-chested, planted on four heavy legs.
  P('queenTorso', prism(0.56, 0.44, 0.84, 6), { y: 1.12, z: -0.06 });
  P('queenChest', prism(0.5, 0.58, 0.24, 6), { y: 1.4, z: -0.34, rx: -0.2 });
  // THE LANCE. Long, level, at chest height and well proud of the body - the
  // whole charge is written on the model, and the lane telegraph is drawn to
  // the same width.
  P('queenLance', spike(0.13, 1.5, 5), {
    y: 1.32, z: -1.05, rx: Math.PI / 2, mat: SHARED_MATS.hiveChitin,
  });
  // The head, low between the shoulders - she is a queen, not a soldier, and
  // the face must not be the thing you read.
  P('queenHead', shard(0.24), { y: 1.62, z: -0.4, sz: 0.9 });
  // The waist, lit like every waist in the family, then the ABDOMEN: two huge
  // segments rising away behind, the biggest mass on the model.
  P('queenWaist', prism(0.16, 0.2, 0.34, 6), {
    y: 1.0, z: 0.52, rx: -0.3, mat: SHARED_MATS.hiveAmber, shadow: false,
  });
  P('queenAbdA', lump(0.5), { y: 1.06, z: 0.98, sy: 0.9, sx: 1.1 });
  P('queenAbdB', lump(0.38), { y: 1.3, z: 1.5, sy: 0.95, sx: 1.0 });
  // THE EGG SAC, lit from inside and held on the enemy: it swells as a hatch
  // comes due, which is the model's own telegraph for the brood.
  e.queenSac = P('queenSac', shard(0.34), {
    y: 1.14, z: 1.2, sz: 0.75, mat: SHARED_MATS.hiveAmber, shadow: false,
  });
  // Arms: two long blades, held low and out.
  P('queenArm', slab(0.16, 0.9, 0.16), { x: -0.72, y: 1.1, rz: 0.35 });
  P('queenArm', slab(0.16, 0.9, 0.16), { x: 0.72, y: 1.1, rz: -0.35 });
  // Four planted legs and two haunches, so the silhouette below the waist is
  // all weight.
  for (const [x, z, ry] of [[-0.5, -0.2, 0.35], [0.5, -0.2, -0.35], [-0.44, 0.42, 0.7], [0.44, 0.42, -0.7]]) {
    P('queenLeg', slab(0.2, 0.62, 0.22), { x, y: 0.32, z, ry });
  }
  P('queenHaunch', rock(0.3), { x: -0.62, y: 0.6, z: 0.5, sy: 0.8 });
  P('queenHaunch', rock(0.3), { x: 0.62, y: 0.6, z: 0.5, sy: 0.8, ry: 1.1 });

  // THE SHELL. Three sets of plates, one per third of the fight, hidden in
  // MOLT order - abdomen first (the biggest, the least missed), then the
  // crown, then the shoulders - so the boss visibly comes apart toward her
  // quickest self. Collected as SETS rather than one list, and hidden whole
  // in a single frame rather than faded, for the glacier's reason: the moment
  // it goes is an event and must not be a transition.
  const plate = (set, key, geo, o) => set.push(P(key, geo, { ...o, mat: SHARED_MATS.hiveChitin }));
  const shoulders = [];
  plate(shoulders, 'queenPauldron', shard(0.5), { x: -0.66, y: 1.6, rz: 0.55, sz: 0.45 });
  plate(shoulders, 'queenPauldron', shard(0.5), { x: 0.66, y: 1.6, rz: -0.55, sz: 0.45 });
  plate(shoulders, 'queenBackPlate', shard(0.44), { y: 1.86, z: 0.28, rx: 0.5, sz: 0.5 });
  const crown = [];
  plate(crown, 'queenCrest', spike(0.2, 0.9, 5), { y: 2.0, z: -0.3, rx: -0.25 });
  plate(crown, 'queenCrestSide', spike(0.14, 0.66, 4), { x: -0.3, y: 1.92, rz: 0.7 });
  plate(crown, 'queenCrestSide', spike(0.14, 0.66, 4), { x: 0.3, y: 1.92, rz: -0.7 });
  plate(crown, 'queenMask', shard(0.3), { y: 1.66, z: -0.58, sz: 0.35 });
  const abdomen = [];
  plate(abdomen, 'queenAbdPlate', shard(0.56), { y: 1.12, z: 0.98, sz: 0.5 });
  plate(abdomen, 'queenAbdPlate', shard(0.44), { y: 1.36, z: 1.44, sz: 0.5, ry: 0.8 });
  plate(abdomen, 'queenAbdPlate', shard(0.34), { y: 1.52, z: 1.74, sz: 0.5, ry: 1.5 });
  e.shellSets = [shoulders, crown, abdomen];
  eyes(P, { y: 1.68, x: 0.13, z: -0.58, r: 1.4, mat: e.eyeMat });
}

// A drone is its pack. The count is capped because speed is not: three
// neighbours is a cloud that moves like one animal, six would be a screen
// blur, and the difference between those two things is where the enemy
// stops being a lesson and starts being a bug.
export function aiDrone(e, a) {
  let pack = 0;
  for (const o of a.ctx.enemies) {
    // Same flight only, for the crowd-separation's reason: a wasp four
    // metres UP is not running beside anyone.
    if (o === e || o.dead || o.boss || o.flying !== e.flying) continue;
    const dx = o.pos.x - e.pos.x;
    const dz = o.pos.z - e.pos.z;
    if (dx * dx + dz * dz < DRONE_PACK_R * DRONE_PACK_R) {
      if (++pack >= DRONE_PACK_CAP) break;
    }
  }
  const mul = 1 + pack * DRONE_PACK_STEP;
  // THE CLAMP MOVES WITH THE PACK. update() caps a frame's travel at
  // speed * stepMul, so a pack bonus written into the velocity alone would
  // arrive at 1.4x and be silently eaten - the bug every committed charge in
  // this game had before they all raised it too.
  e.stepMul = 1.4 * mul;
  aiMelee(e, a);
  // The waist pulses with the pack, so the speed has a place on the body: a
  // drone alone has a dim seam and a drone in the cloud is lit up.
  if (e.waistMesh) e.waistMesh.scale.setScalar((0.8 + pack * 0.22) * e.scale);
  a.vx *= mul;
  a.vz *= mul;
}

// Fires on the PULSE, with every other spitter in the room. The tell is the
// throat swelling on the half-beat before, so a room of them rears as one -
// and that is the entire reason the volley is survivable: it arrives as a
// wall on a beat the player can count, and between walls is the player's
// time.
export function aiSpitter(e, a) {
  orbit(e, a, ENEMY_TYPES.spitter.orbit);
  if (a.dist > SPIT_RANGE) {
    e._setEyeAlert(false);
    if (e.spitThroat) e.spitThroat.scale.setScalar(0.8 * e.scale);
    // THE WALL IN PROGRESS IS SPENT, for a spitter that was not in the room
    // for it. Without this line one that walks into range mid-period fires
    // the instant it arrives, untold, off the beat every other spitter is
    // on - the drizzle this whole enemy is written to avoid.
    e._lastSpitWall = Math.floor(a.ctx.pulse / SPIT_PERIOD);
    return;
  }
  const wall = Math.floor(a.ctx.pulse / SPIT_PERIOD);
  const ph = a.ctx.pulse % SPIT_PERIOD;
  // A SPITTER SPAWNED MID-WALL HAS MISSED IT, the same way one that walked
  // in has: the first volley it takes part in is the next whole one.
  if (e._lastSpitWall === undefined) e._lastSpitWall = wall;
  // THE TELL PULSE: one half-beat out from the volley, together, everywhere.
  const rearing = ph === SPIT_PERIOD - 1;
  e._setEyeAlert(rearing);
  if (e.spitThroat) {
    e.spitThroat.scale.setScalar((rearing ? 1.3 : 0.8) * e.scale);
  }
  // THE WALL, ON THE EDGE. `pulse` is a counter the music owns and this reads
  // an EDGE off it - the same contract every beat-driven thing in the game
  // keeps - with the whole ZERO MODULO CLASS as the edge rather than the
  // single value: a long frame can step the counter past one value entirely,
  // and a volley that quietly skipped a beat would read as the room's rhythm
  // being broken rather than as a frame being long.
  if (ph >= SPIT_PERIOD - 1) return;
  if (wall === e._lastSpitWall) return;
  e._lastSpitWall = wall;
  e.flash = 0.12;
  // A FAN, not a stack: spread rewards stepping ACROSS the wall rather than
  // backing away from it, which is the habit the whole theme is built on.
  for (let i = 0; i < SPIT_DARTS; i++) {
    a.ctx.addProjectile(
      e.pos.x, 1.2, e.pos.z, 'spitter', e._projScale(),
      (i - (SPIT_DARTS - 1) / 2) * SPIT_SPREAD
    );
  }
  if (a.ctx.effects) {
    _hiveAt.set(e.pos.x, 1.3, e.pos.z);
    a.ctx.effects.burst(_hiveAt, 0xffc94d, 5, 3, 1.5, 0.3);
  }
}

// A brute with one trick besides the swing: the STING, a telegraphed lunge
// that does not chase. Four states - walk, wind up, lunge, recover - and the
// wind-up is where all the counterplay lives, exactly as the gulper's and
// the thornling's is.
export function aiSoldier(e, a) {
  if (e.sState === undefined) {
    e.sState = 'walk';
    e.sT = 0;
    e.sCd = 1.2 + Math.random() * 1.8;
    e.sHx = 0;
    e.sHz = 1;
    e.sHit = false;
    e.sPush = 0;
  }
  const ctx = a.ctx;

  // THE SHOVE, still running. Kept at the top so a soldier that dies, freezes
  // or is frightened mid-stab still finishes the push it landed - the gust is
  // air that has already been moved, exactly as the squall's is.
  if (e.sPush > 0) {
    e.sPush -= a.dt;
    if (ctx.pullPlayer) ctx.pullPlayer(e.sHx, e.sHz, SOLD_PUSH);
  }

  // THE WIND-UP. It nearly stops - a telegraph the enemy can chase you with
  // is a countdown you cannot outrun. The jaw roots swell, so the tell is on
  // the model as well as in the stance.
  if (e.sState === 'windup') {
    a.vx = 0;
    a.vz = 0;
    e._setEyeAlert(true);
    if (e.jawRoot) e.jawRoot.scale.setScalar(1.4 * e.scale);
    if (e.jawL && e.jawR) {
      e.jawL.rotation.z = 0.42 + 0.3 * Math.sin(ctx.time * 18);
      e.jawR.rotation.z = -0.42 - 0.3 * Math.sin(ctx.time * 18);
    }
    e.sT -= a.dt;
    if (e.sT <= 0) {
      // AIMED AT WHERE THE PLAYER IS NOW, frozen for the lunge - the player
      // gets the whole wind-up and the whole lunge to be elsewhere.
      e.sHx = a.nx;
      e.sHz = a.nz;
      e.sState = 'stab';
      e.sT = SOLD_STAB_TIME;
      e.sHit = false;
    }
    return;
  }

  if (e.sState === 'stab') {
    // THE CLAMP AGAIN: a lunge is a committed charge, and it raises stepMul
    // for the same reason every other one in the game does.
    e.stepMul = SOLD_STAB_MUL;
    const sp = e._effSpeed() * SOLD_STAB_MUL;
    a.vx = e.sHx * sp;
    a.vz = e.sHz * sp;
    e.group.rotation.y = Math.atan2(e.sHx, e.sHz) + Math.PI;
    e.faceLocked = true;
    const dy = Math.abs(ctx.player.pos.y - e.pos.y);
    if (!e.sHit && a.dist < e.radius + 1.0 && dy < MELEE_REACH_Y) {
      e.sHit = true;
      // Through onHitPlayer, not landHit: the shove is not the type's touch,
      // it is this one blow, and a rider this large must not start arriving
      // with every incidental contact.
      ctx.onHitPlayer(Math.min(SOLD_STAB_CAP, e.damage * 1.4), e.pos, e);
      // THE SHOVE, along the sting's own heading: the player is not pushed
      // away from the soldier, they are pushed the way the soldier was
      // going - into whatever the hive has waiting there.
      e.sPush = SOLD_PUSH_TIME;
      if (ctx.effects) {
        _hiveAt.set(e.pos.x + e.sHx, 1.0, e.pos.z + e.sHz);
        ctx.effects.burst(_hiveAt, 0xffc94d, 14, 5, 2, 0.4);
        ctx.effects.addShake(0.14);
      }
    }
    e.sT -= a.dt;
    if (e.sT <= 0) {
      e.sState = 'recover';
      e.sT = 0.9;
      e.sCd = SOLD_CD * e.rate;
    }
    return;
  }

  e.stepMul = 1.4;
  if (e.jawRoot) e.jawRoot.scale.setScalar(1 * e.scale);
  if (e.sState === 'recover') {
    // Slow and AWAY: the window. A soldier that recovered straight back into
    // the player's face would never have exposed the lunge's miss.
    a.vx = -a.nx * e._effSpeed() * 0.5;
    a.vz = -a.nz * e._effSpeed() * 0.5;
    e._setEyeAlert(false);
    e.sT -= a.dt;
    if (e.sT <= 0) e.sState = 'walk';
    return;
  }

  // walk. The ordinary melee cycle runs all the time the stab is not, so a
  // soldier at arm's length is still a brute.
  aiMelee(e, a);
  e.sCd -= a.dt;
  if (e.sCd > 0 || a.dist < SOLD_STAB_MIN || a.dist > SOLD_STAB_MAX) return;
  e.sState = 'windup';
  e.sT = SOLD_WINDUP;
}

// Lobs a CLUTCH of eggs - one glob, three hatching circles where it lands,
// close enough together to read as a nest rather than a scatter. The lob
// itself is every other lob in the game: same arc, same lead, same tell, so
// the player has one thing to learn and this theme spends it on the delay.
export function aiBrooder(e, a) {
  orbit(e, a, ENEMY_TYPES.brooder.orbit);
  if (e.attackCd > 0 || a.dist > BROOD_RANGE) return;
  e.attackCd = BROOD_CD + Math.random() * 0.8;
  e.flash = 0.15;
  a.ctx.addSpit(e.pos.x + a.nx * 0.8, 1.1, e.pos.z + a.nz * 0.8, 'egg');
  if (a.ctx.effects) {
    _hiveAt.set(e.pos.x + a.nx * 0.5, 1.3, e.pos.z + a.nz * 0.5);
    a.ctx.effects.burst(_hiveAt, 0xffa000, 10, 3, 2, 0.5);
  }
}

// No attack. It FEEDS: everything inside its range acts more often, for as
// long as it lives. Written as a paydown on the target's own cooldown rather
// than a flag the target reads, exactly like the conduit's buff - it lapses
// with nothing to clean up, and an enemy that wanders out of range takes its
// old rhythm back with it.
export function aiNurse(e, a) {
  orbit(e, a, ENEMY_TYPES.nurse.orbit);
  // THE COMB TURNS, and the core breathes with the feeding - the whole
  // animation budget of the enemy, on its own clock because a body feeding
  // is not a thing the track has an opinion about.
  if (e.combCells) {
    for (const c of e.combCells) {
      c.a += a.dt * 0.5;
      c.mesh.position.x = Math.cos(c.a) * 0.5 * e.scale;
      c.mesh.position.z = Math.sin(c.a) * 0.5 * e.scale;
    }
  }
  let fed = 0;
  for (const o of a.ctx.enemies) {
    // Bosses excluded for the conduit's reason: an unreadable change to the
    // one fight the player is already reading closely. Nurses excluded so
    // two of them do not feed each other into a permanent frenzy.
    if (o === e || o.dead || o.boss || o.type === 'nurse') continue;
    const dx = o.pos.x - e.pos.x;
    const dz = o.pos.z - e.pos.z;
    if (dx * dx + dz * dz > NURSE_RANGE * NURSE_RANGE) continue;
    o.attackCd = Math.max(0, o.attackCd - NURSE_RATE * a.dt);
    // THE BEAM. The haste must be visible or the wave is simply wrong and
    // the player cannot know why - the same rule the conduit's and the
    // bellows' links keep, paid for in the same place.
    if (fed++ < NURSE_LINKS && a.ctx.effects) {
      a.ctx.effects.beam(e.pos, o.pos, 0xffc94d);
    }
  }
  if (e.nurseCore) {
    e.nurseCore.scale.setScalar((0.85 + (fed > 0 ? 0.3 : 0.1) * Math.sin(a.ctx.time * 5 + e.id)) * e.scale);
  }
  e._setEyeAlert(fed > 0);
}

// The wasp's four states, and the loop is the fight with it: a wide patient
// orbit, a rear-up, a shallow committed pass through where the player was
// standing, and the climb away that is the shot.
export function aiWasp(e, a) {
  if (!e.wState) {
    e.wState = 'orbit';
    e.wT = 1 + Math.random() * 1.6;
    e.wHx = 0;
    e.wHz = 1;
    e.wHit = false;
  }
  const ctx = a.ctx;
  e.wT -= a.dt;

  if (e.wState === 'orbit') {
    e.hoverY = WASP_HIGH;
    e.flyRate = FLY_RATE_DEFAULT;
    e.stepMul = 1.4;
    const push = a.dist < WASP_STANDOFF ? -0.85 : 0.7;
    const sp = e._effSpeed();
    a.vx = (a.nx * push - a.nz * 0.5) * sp;
    a.vz = (a.nz * push + a.nx * 0.5) * sp;
    if (e.wT <= 0 && a.dist < WASP_STANDOFF + 6) {
      e.wState = 'tell';
      e.wT = WASP_TELL;
      e._setEyeAlert(true);
    }
    return;
  }

  if (e.wState === 'tell') {
    // Rears and drifts in. Rising while everything else on the floor is
    // coming DOWN the screen is the tell that carries at range - the
    // shrike's trick, because it is the right one.
    e.hoverY = WASP_HIGH + 0.9;
    e.flyRate = 5;
    a.vx = a.nx * a.sp * 0.3;
    a.vz = a.nz * a.sp * 0.3;
    if (e.wT <= 0) {
      // FROZEN HERE, aimed at where the player is standing: the pass runs
      // THROUGH that spot and on out the far side, and cannot steer.
      e.wHx = a.nx;
      e.wHz = a.nz;
      e.wState = 'pass';
      e.wT = WASP_PASS_TIME;
      e.wHit = false;
      if (ctx.effects) {
        _hiveAt.set(ctx.player.pos.x, 0.1, ctx.player.pos.z);
        ctx.effects.shockwave(_hiveAt, 0xffa000, 1.6, 0.35);
      }
    }
    return;
  }

  if (e.wState === 'pass') {
    e.hoverY = WASP_PASS_Y;
    e.flyRate = 10;
    e.stepMul = WASP_PASS_MUL;
    const sp = e._effSpeed() * WASP_PASS_MUL;
    a.vx = e.wHx * sp;
    a.vz = e.wHz * sp;
    e.group.rotation.y = Math.atan2(e.wHx, e.wHz) + Math.PI;
    e.faceLocked = true;
    // Hits whoever is in the way, not only whoever was on the mark - it is a
    // body travelling, and the spot was where it was AIMED.
    const dy = Math.abs(ctx.player.pos.y - e.pos.y);
    if (!e.wHit && a.dist < WASP_HIT_R && dy < MELEE_REACH_Y) {
      e.wHit = true;
      // Through landHit so the sting leaves its poison where a drone's
      // nothing and a cinder's fire would - the hitStatus is on the type.
      landHit(e, ctx);
      if (ctx.effects) {
        _hiveAt.set(e.pos.x, e.pos.y, e.pos.z);
        ctx.effects.burst(_hiveAt, 0xffc94d, 12, 4, 2, 0.4);
        ctx.effects.addShake(0.1);
      }
    }
    // Out of time, or out of room - a pass that ran the wall would grind
    // along it, which is the ashwing's lesson written here too.
    if (e.wT <= 0 || Math.abs(e.pos.x) > 20 || Math.abs(e.pos.z) > 20) {
      e.wState = 'climb';
      e.wT = WASP_CLIMB;
      e._setEyeAlert(false);
    }
    return;
  }

  // climb. The bill for the pass: slow, high and AWAY - the window, exactly
  // as the shrike's climb is.
  e.hoverY = WASP_HIGH + 1.2;
  e.flyRate = 2.5;
  e.stepMul = 1.4;
  a.vx = -a.nx * a.sp * 0.7;
  a.vz = -a.nz * a.sp * 0.7;
  if (e.wT <= 0) {
    e.wState = 'orbit';
    e.wT = WASP_CD * (0.7 + Math.random() * 0.6);
  }
}

// ---- the Brood Queen --------------------------------------------------------
// THE FIGHT IN ONE PARAGRAPH. She is the swarm's schedule: the wave the player
// is fighting is the one she keeps putting bodies into, and her own bar is a
// shell that comes off a set at a time. Three molts - at roughly the top
// quarter of each third of the bar - and each one drops a set of plates,
// speeds her up and hatches the floor, so the fight escalates the way a hive
// does: the queen does not get more dangerous, she gets MORE.
//
// WHAT SHE CAN REACH FOR, and none of it is a reskin of another boss's move:
//   the HATCH   three circles fill around the player, and drones hatch from
//               them - on a ring, never on the player, capped so the floor
//               cannot fill - and shooting the young is shooting the boss's
//               own pressure budget
//   the LANCE   a telegraphed lane, then a charge down it that SHOVES rather
//               than merely hurting; bait it into a wall and she spends
//               herself on the geometry, which is the player's window
//   the SPRAY   a fan of venom laid toward the player in one frame - the
//               artillery of her own theme, bile patches and all
//   the MOLT    not an attack but the spine of the fight: armor falls in
//               tiers, she quickens, and the window after each one is the
//               player's to spend

// The molt thresholds. Three of them, one per shell set, spread so the fight
// has a LONG middle: the first molt comes early enough to teach that the
// plates come off, the last one late enough that a bare queen is a reward
// rather than a formality.
export const QUEEN_MOLT_AT = [0.72, 0.45, 0.2];

export const QUEEN_MOLT_TIME = 2.4;

// What each molt buys her, as a multiplier on her own speed. It compounds:
// three molts is 1.3x, which on a 2.4 base is a queen that keeps pace with
// her own drones.
export const QUEEN_MOLT_SPEED = 1.1;

// The shell's worth, by molts survived. She starts at 0.45 - a heavier grind
// than the Forge's shut chest, because she does not also have a vent clock to
// offer - and each molt drops it a step, ending bare. armorDefault IS the same
// function, for the Crown's reason: the shell is a state, and a constant
// would hold burns and blasts at 0.45 long after the plates were on the floor.
export const QUEEN_ARMOR = [0.45, 0.62, 0.8];

export const QUEEN_SETS = 3;

export function _queenArmor(e) {
  if (e.bs.weakOpen) return 1;
  const molted = Math.min(QUEEN_SETS, Math.max(0, e.bs.molt || 0));
  // INDEXED BY MOLTS SURVIVED, which is the direction the shell actually
  // comes off: all three sets on is 0.45, then 0.62, then 0.8, and a queen
  // who has spent every set is bare. Indexed by sets LEFT it reads the
  // ladder backwards - she would armour UP as the plates fall off.
  return QUEEN_ARMOR[molted] ?? 1;
}

// The hatch.
//
// THE RING IS THE PROMISE. Pods land no closer than this to the player - never
// under them, never where the player is about to be - so a hatched drone is a
// body that visibly crosses ground, exactly as every spawn in the game is.
export const QUEEN_HATCH_RING = 6.5;

export const QUEEN_HATCH_RING_VAR = 2.5;

export const QUEEN_HATCH_PODS = 3;

export const QUEEN_HATCH_MAX = 5;

export const QUEEN_HATCH_TELL = 1.2;

export const QUEEN_HATCH_CD = 8;

// The lance. The lane is drawn at full length from the first frame and fills,
// exactly as Colossus's does - the AREA reads instantly, the TIMING as it
// goes - and the charge that runs down it is the one attack in her kit that
// the ROOM can answer: put a wall in it and she pays for it.
export const QUEEN_LANE_LEN = 20;

export const QUEEN_LANE_W = 2.2;

export const QUEEN_LANCE_TELL = 1.0;

export const QUEEN_LANCE_SPEED = 13;

export const QUEEN_LANCE_TIME = 2.2;

export const QUEEN_LANCE_CAP = 30;

export const QUEEN_LANCE_PUSH = 5;

export const QUEEN_LANCE_CD = 9;

export const QUEEN_SLAM_TIME = 2.2;

// The spray. Five patches in a fan aimed at the player, laid in a single
// frame off a wind-up - the kiln's bar and the forge's ring both taught this
// shape, and the difference here is that it is AIMED, so the answer is to be
// off the arc rather than out of the ring.
export const QUEEN_SPRAY_N = 5;

export const QUEEN_SPRAY_STEP = 0.24;

export const QUEEN_SPRAY_R0 = 3.2;

export const QUEEN_SPRAY_R1 = 8.5;

export const QUEEN_SPRAY_WINDUP = 0.8;

export const QUEEN_SPRAY_CD = 11;

export const QUEEN_VENOM_R = 1.6;

export const QUEEN_VENOM_LIFE = 5;

export const QUEEN_VENOM_DPS = 6;

// How many of her hatched drones are still on the floor. Counted live rather
// than tracked, so a drone the player kills frees its slot the same frame -
// the same contract Colossus's turrets keep.
export function _queenBroodLive(ctx) {
  let n = 0;
  for (const o of ctx.enemies) {
    if (!o.dead && o.hatched) n++;
  }
  return n;
}

export function aiBroodQueen(e, a) {
  const bs = e.bs;
  const ctx = a.ctx;
  if (bs.state === undefined) {
    bs.state = 'walk';
    bs.t = 0;
    bs.hatchCd = QUEEN_HATCH_CD * 0.6;
    bs.lanceCd = QUEEN_LANCE_CD;
    bs.sprayCd = QUEEN_SPRAY_CD;
    bs.mark = -1;
    // The hatch's pod telegraphs, kept in the one field `releaseMarks`
    // already walks on every boss - a queen killed with pods down must give
    // every handle back, and the shared cleanup knows this shape because the
    // Crown's rings already kept it.
    bs.rings = [];
    bs.molt = 0;
    bs.weakOpen = false;
    bs.ventNote = 'MOLTING';
    bs.fx = ctx.effects;
    bs.dirX = 0;
    bs.dirZ = 1;
    bs.push = 0;
  }
  bs.fx = ctx.effects;
  bs.t -= a.dt;

  // THE LANCE'S SHOVE, still running. Kept at the top so a queen that dies,
  // freezes or is frightened mid-charge still finishes the push she landed -
  // the gust is air that has already been moved, the squall's contract.
  if (bs.push > 0) {
    bs.push -= a.dt;
    if (ctx.pullPlayer) ctx.pullPlayer(bs.dirX, bs.dirZ, QUEEN_LANCE_PUSH);
  }

  // Body contact, and in every state but the lance - which lands its own,
  // much larger, hit and must not also bill for the body it arrived in.
  if (bs.state !== 'lance') bossTouch(e, a);

  // THE SAC. It swells as a hatch comes due, on the model, before any circle
  // appears - the boss's own warning, for the player who is looking at her.
  if (e.queenSac) {
    const ripe = Math.max(0, 1 - bs.hatchCd / 4);
    const k = 0.8 + ripe * 0.55 + 0.08 * Math.sin(ctx.time * 6);
    e.queenSac.scale.setScalar(k * e.scale);
  }

  // ---- the molt check ---------------------------------------------------
  // Runs in every state, before anything else: crossing a threshold
  // interrupts whatever she was doing. The ABDOMEN set comes off first - the
  // biggest plates, the least missed - so the boss visibly gets smaller and
  // quicker in the order the player would choose if they were asked.
  if (bs.molt < QUEEN_MOLT_AT.length && e.hp <= e.maxHp * QUEEN_MOLT_AT[bs.molt]) {
    bs.molt++;
    if (e.shellSets) {
      const set = e.shellSets[QUEEN_SETS - bs.molt];
      if (set) for (const m of set) m.visible = false;
    }
    e.speed *= QUEEN_MOLT_SPEED;
    // Whatever she was holding comes back to the pool: a molt interrupts, it
    // does not queue.
    if (bs.rings) {
      for (const r of bs.rings) ctx.effects.markRelease(r.mark);
      bs.rings.length = 0;
    }
    if (bs.mark >= 0) {
      ctx.effects.markRelease(bs.mark);
      bs.mark = -1;
    }
    bs.state = 'molt';
    bs.t = QUEEN_MOLT_TIME;
    bs.weakOpen = true;
    // `weakOpen` is the field the 'vent' event reads, so the HUD note and
    // the bar's colour come for free.
    ctx.bossEvent('vent', e);
    if (ctx.effects) {
      _hiveAt.set(e.pos.x, 1.2, e.pos.z);
      ctx.effects.shockwave(_hiveAt, 0xffa000, 7, 0.5);
      ctx.effects.burst(_hiveAt, 0xffc94d, 30, 7, 2.5, 0.8);
    }
    if (ctx.sfx) ctx.sfx.impact();
    return;
  }

  // ---- molting ----------------------------------------------------------
  // Stationary and lit: the window. The hatch is armed for the moment she
  // comes out of it - the pressure is how she pays for the armour she lost.
  if (bs.state === 'molt') {
    a.vx = 0;
    a.vz = 0;
    e._setEyeAlert(true);
    if (bs.t <= 0) {
      bs.state = 'walk';
      bs.weakOpen = false;
      bs.hatchCd = 0;
      ctx.bossEvent('vent', e);
    }
    return;
  }

  // ---- hatching ---------------------------------------------------------
  if (bs.state === 'hatch') {
    a.vx = 0;
    a.vz = 0;
    e._setEyeAlert(true);
    const k = 1 - Math.max(0, bs.t) / QUEEN_HATCH_TELL;
    for (const p of bs.rings) {
      ctx.effects.markSet(p.mark, p.x, p.z, EGG_RADIUS, 0xffa000, k);
    }
    if (bs.t <= 0) {
      for (const p of bs.rings) {
        ctx.effects.markRelease(p.mark);
        // A real enemy, spawned through the anchor hook because that is the
        // one door main.js already keeps for "a boss puts a body in the
        // floor where it asked". Scaled by health alone - it moves and hits
        // like any drone, and its damage is the wave's own.
        const d = ctx.addAnchor(p.x, p.z, 'drone');
        if (d) {
          d.hatched = true;
          if (ctx.effects) {
            _hiveAt.set(p.x, 0.5, p.z);
            ctx.effects.burst(_hiveAt, 0xffa000, 16, 4, 2, 0.5);
          }
        }
      }
      bs.rings.length = 0;
      bs.state = 'walk';
      bs.hatchCd = QUEEN_HATCH_CD * e.rate;
      e._setEyeAlert(false);
    }
    return;
  }

  // ---- the lance: telegraph ----------------------------------------------
  if (bs.state === 'tele') {
    a.vx = 0;
    a.vz = 0;
    e._setEyeAlert(true);
    // The lane at full length from the first frame: the AREA reads instantly,
    // the fill reads the timing. Rot points the long axis down the heading.
    ctx.effects.markSet(
      bs.mark,
      e.pos.x + bs.dirX * QUEEN_LANE_LEN * 0.5,
      e.pos.z + bs.dirZ * QUEEN_LANE_LEN * 0.5,
      QUEEN_LANE_W, 0xffb300, 1 - bs.t / QUEEN_LANCE_TELL,
      QUEEN_LANE_LEN / (QUEEN_LANE_W * 2), Math.atan2(-bs.dirX, -bs.dirZ)
    );
    if (bs.t <= 0) {
      ctx.effects.markRelease(bs.mark);
      bs.mark = -1;
      bs.state = 'lance';
      bs.t = QUEEN_LANCE_TIME;
      bs.lanceHit = false;
      ctx.bossEvent('charge', e);
    }
    return;
  }

  // ---- the lance: the charge ---------------------------------------------
  if (bs.state === 'lance') {
    e.stepMul = QUEEN_LANCE_SPEED / Math.max(0.5, a.sp);
    a.vx = bs.dirX * QUEEN_LANCE_SPEED;
    a.vz = bs.dirZ * QUEEN_LANCE_SPEED;
    if (!bs.lanceHit && a.dist < e.radius + 1.1 && _reachY(a) < BOSS_REACH_Y) {
      bs.lanceHit = true;
      ctx.onHitPlayer(Math.min(QUEEN_LANCE_CAP, e.damage * 1.2), e.pos, e);
      // THE SHOVE, down the lane's own heading and for the rest of the
      // charge - the sting's whole argument at boss scale, held as a gust
      // for the squall's reason.
      bs.push = 0.4;
      ctx.effects.addShake(0.28);
      _hiveAt.set(e.pos.x, 1.4, e.pos.z);
      ctx.effects.burst(_hiveAt, 0xffc94d, 20, 6, 2, 0.6);
    }
    if (e.blockedBy > 0.05 || bs.t <= 0) {
      // INTO THE GEOMETRY. The reward for baiting the lane, and the one
      // window in her kit the player can open on purpose.
      const slammed = e.blockedBy > 0.05;
      bs.state = 'recover';
      bs.t = slammed ? QUEEN_SLAM_TIME : 1.0;
      if (slammed) {
        bs.weakOpen = true;
        ctx.bossEvent('stagger', e);
        _hiveAt.set(e.pos.x, 0, e.pos.z);
        ctx.effects.shockwave(_hiveAt, 0xffb300, 7, 0.5);
        ctx.effects.burst(_hiveAt, 0xffc94d, 30, 8, 3, 0.8);
        ctx.effects.addShake(0.32);
      }
    }
    return;
  }

  // ---- recovering --------------------------------------------------------
  if (bs.state === 'recover') {
    e.stepMul = 1.4;
    a.vx = a.px * a.sp * 0.4;
    a.vz = a.pz * a.sp * 0.4;
    if (bs.t <= 0) {
      bs.state = 'walk';
      bs.weakOpen = false;
      bs.lanceCd = QUEEN_LANCE_CD * e.rate;
      ctx.bossEvent('recover', e);
    }
    return;
  }

  // ---- the spray ---------------------------------------------------------
  if (bs.state === 'spray') {
    a.vx = 0;
    a.vz = 0;
    e._setEyeAlert(true);
    if (bs.t <= 0) {
      // AIMED AT THE PLAYER, in one frame, and the wind-up is the only
      // warning it gets - the same bargain the forge's ring makes.
      const base = Math.atan2(a.nz, a.nx);
      for (let i = 0; i < QUEEN_SPRAY_N; i++) {
        const ang = base + (i - (QUEEN_SPRAY_N - 1) / 2) * QUEEN_SPRAY_STEP;
        const r = QUEEN_SPRAY_R0 + Math.random() * (QUEEN_SPRAY_R1 - QUEEN_SPRAY_R0);
        ctx.addHazard(
          e.pos.x + Math.cos(ang) * r, e.pos.z + Math.sin(ang) * r,
          QUEEN_VENOM_R, QUEEN_VENOM_LIFE, QUEEN_VENOM_DPS, 'bile'
        );
      }
      _hiveAt.set(e.pos.x, 0.6, e.pos.z);
      if (ctx.effects) {
        ctx.effects.shockwave(_hiveAt, 0xffa000, QUEEN_SPRAY_R1, 0.45);
        ctx.effects.burst(_hiveAt, 0x9be564, 22, 6, 2.5, 0.6);
      }
      if (ctx.sfx) ctx.sfx.impact();
      bs.state = 'walk';
      bs.sprayCd = QUEEN_SPRAY_CD * e.rate;
      e._setEyeAlert(false);
    }
    return;
  }

  // ---- walking, and choosing ---------------------------------------------
  e.stepMul = 1.4;
  aiMelee(e, a);
  bs.hatchCd -= a.dt;
  bs.lanceCd -= a.dt;
  bs.sprayCd -= a.dt;
  if (e.status.fear > 0) {
    e._setEyeAlert(false);
    return;
  }

  // THE HATCH, first among equals: she is the schedule, and a player who
  // never sees a hatch is fighting a brute that happens to be a bug. The cap
  // is checked BEFORE the state change, and a blocked hatch costs her nothing
  // - standing down for eight seconds because the floor is full would make
  // the cap feel like a bug rather than a law.
  if (bs.hatchCd <= 0) {
    const room = QUEEN_HATCH_MAX - _queenBroodLive(ctx);
    const n = Math.min(QUEEN_HATCH_PODS, room);
    let placed = false;
    if (n > 0) {
      // THE RING, spun off a random bearing so the same three compass points
      // are not the answer every hatch.
      const off = Math.random() * Math.PI * 2;
      bs.rings.length = 0;
      for (let i = 0; i < n; i++) {
        const ang = off + (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.6;
        const rr = QUEEN_HATCH_RING + Math.random() * QUEEN_HATCH_RING_VAR;
        const x = Math.max(-19, Math.min(19, ctx.player.pos.x + Math.cos(ang) * rr));
        const z = Math.max(-19, Math.min(19, ctx.player.pos.z + Math.sin(ang) * rr));
        bs.rings.push({ mark: ctx.effects.markAcquire(), x, z });
        placed = true;
      }
    }
    if (placed) {
      bs.state = 'hatch';
      bs.t = QUEEN_HATCH_TELL;
      bs.hatchCd = QUEEN_HATCH_CD * e.rate;
      return;
    }
    bs.hatchCd = 3;
  }

  // THE SPRAY. Never both this and the lance on the same breath - the venom
  // is what punishes standing off, the lane what punishes being caught in
  // the open.
  if (bs.sprayCd <= 0 && a.dist < 24) {
    bs.state = 'spray';
    bs.t = QUEEN_SPRAY_WINDUP;
    e.flash = 0.2;
    return;
  }

  // THE LANCE, from range: a lane at arm's length would land in the player's
  // lap, and the one thing a charge must never be is a surprise at close
  // quarters.
  if (bs.lanceCd <= 0 && a.dist > 8 && a.dist < 26) {
    bs.mark = ctx.effects.markAcquire();
    bs.state = 'tele';
    bs.t = QUEEN_LANCE_TELL;
    bs.dirX = a.nx;
    bs.dirZ = a.nz;
  }
}

const TYPES = {
  // ---- HIVE ---------------------------------------------------------------
  //
  // Six types around one idea, stated on every one of their cards: THE BODY
  // IS NOT THE THREAT, THE COLONY IS. A drone alone is the slowest rusher in
  // the game and a drone in a cloud is among the fastest; a spitter's dart is
  // the weakest round in the game and six spitters on the same half-beat are
  // a wall; a soldier is an ordinary brute until the sting takes your
  // position rather than your health and plants you among the drones; a
  // brooder's eggs are nothing at all until they are not; a nurse makes every
  // one of them quicker; and a wasp is none of these things unless it hits
  // you, which is when you are poisoned for the swarm's trouble.
  //
  // WHICH IS WHY THE ANSWER TO A HIVE WAVE IS THE SAME AS ITS QUESTION: kill
  // the outliers to slow the cloud, kill the beam to end the haste, break the
  // nest before it hatches. Every one of those is a decision about WHICH
  // body, and the theme exists to make that decision matter.

  // The baseline body, and the one whose mechanic is the theme's thesis:
  // worth almost nothing alone, and faster for every ally it runs with.
  drone: {
    head: { r: 0.28, y: 1.1 },
    hp: 30, speed: 3.2, damage: 9, value: 210, color: 0xe09a00, eye: 0xfff3d6,
    scale: 0.95, radius: 0.46, mass: 1,
    melee: { windup: 0.38, start: 1.4, hit: 2.0, cd: 1.15 },
    build: buildDrone, ai: aiDrone,
  },

  // The synchronized gunner. Damage sits at the envelope's floor for a
  // fan-of-three: the DARTS are the weakest rounds in the game, and the wall
  // they arrive as one half-beat at a time is the entire enemy.
  spitter: {
    head: { r: 0.28, y: 1.48 },
    hp: 26, speed: 2.3, damage: 8, value: 240, color: 0xb8860b, eye: 0xfff3d6,
    scale: 1.0, radius: 0.46, mass: 1,
    orbit: { dist: 12, band: 2, out: 0.8, in: -0.6, strafe: 0.4, flip: 2, flipVar: 2 },
    proj: {
      core: 0xfff3d6, glow: 0xffa000, scale: 0.5,
      speed: [15, 0.3, 22], dmg: [6, 0.35, 13],
    },
    build: buildSpitter, ai: aiSpitter,
  },

  // The brute with a shove. An ordinary swing otherwise - the sting is the
  // one blow, on a cooldown, and it costs the player their position in a
  // theme where position is the only thing the swarm cannot manufacture.
  soldier: {
    head: { r: 0.3, y: 1.1 },
    hp: 160, speed: 1.55, damage: 17, value: 330, color: 0x8a5a00, eye: 0xfff3d6,
    scale: 1.45, radius: 0.6, mass: 2,
    melee: { windup: 0.75, start: 2.8, hit: 3.4, cd: 2.3 },
    build: buildSoldier, ai: aiSoldier,
  },

  // No direct damage, exactly like the hailer and the vitriol it stands beside
  // in the role. What it throws is the whole enemy - three circles and the
  // delay, and the ground between the throw and the hatch is completely safe.
  brooder: {
    head: { r: 0.3, y: 0.98 },
    hp: 44, speed: 1.9, damage: 0, value: 280, color: 0xd4a017, eye: 0xfff3d6,
    scale: 1.15, radius: 0.54, mass: 1,
    orbit: { dist: 13, band: 2, out: 0.7, in: -0.5, strafe: 0.3, flip: 2.5, flipVar: 2 },
    // The glob in the air wears the brooder's own colours - every spit kind
    // does, so what is flying and what it becomes are one thing.
    proj: { core: 0xffe9b8, glow: 0xffa000, scale: 1.3 },
    build: buildBrooder, ai: aiBrooder,
  },

  // No attack. The high-value target standing behind the crowd making
  // everything quicker - the conduit's answer arrived at from the opposite
  // direction, and priced beside it.
  nurse: {
    head: { r: 0.3, y: 1.06 },
    hp: 62, speed: 2.1, damage: 0, value: 340, color: 0xffc94d, eye: 0xfff3d6,
    scale: 1.15, radius: 0.5, mass: 1,
    orbit: { dist: 10, band: 2, out: 0.75, in: -0.6, strafe: 0.35, flip: 2.2, flipVar: 2 },
    build: buildNurse, ai: aiNurse,
  },

  // THE AFFLICTOR RULE, PAID IN THE LOWER HALF OF THE BAND: the hit is worth
  // six - the floor of the flier role - because the four seconds of poison it
  // leaves is where the cost lives. A wasp that dealt a full flier's hit AND
  // poisoned would simply be a better flier, and the whole point of the
  // envelope is that no theme gets one.
  wasp: {
    head: { r: 0.26, y: 0.06 },
    hp: 50, speed: 3.6, damage: 6, value: 300, color: 0xf0b429, eye: 0xfff3d6,
    scale: 1.0, radius: 0.48, mass: 1,
    fly: { height: 4.4 },
    hitbox: { r: 0.6, y: 0.35 },
    hitStatus: { kind: 'poison', dur: WASP_POISON },
    build: buildWasp, ai: aiWasp,
  },

  // HIVE's boss, and the one fight in the game where the boss IS the spawn
  // schedule. Colossus throws turrets at the ground near you and the
  // Overgrowth rings itself with thorns; the Brood Queen does neither - she
  // puts HER OWN WAVE on the floor, on rings the player can see coming, and
  // dares them to spend the window shooting the young instead of her.
  //
  // The shell is the spine of it: three sets of plates, three molts, and
  // each one drops armour, raises her speed and hatches the floor - so the
  // fight ends with a bare, quick queen in a room full of her own children,
  // which is the hive's whole argument in one sentence.
  broodqueen: {
    head: { r: 0.42, y: 1.68 },
    hp: 3400, speed: 2.4, damage: 26, value: 5500, color: 0xffa000, eye: 0xfff3d6,
    scale: 3.0, radius: 1.85, mass: 8, boss: true,
    hitbox: { r: 0.74, y: 0.8 },
    statusMul: 0.3, freezeSlow: true, slowFactor: 0.75, freezeVuln: 1.0,
    entropyExempt: true, fearMode: 'stagger',
    melee: { windup: 0.7, start: 3.0, hit: 3.8, cd: 2.0 },
    // The shell, by sets left - and the SAME FUNCTION in both fields, for
    // the Crown's reason: armour that is a state must read the state on
    // every path in, or a blast or a burn arrives at 0.45 while the plates
    // are on the floor and the mechanic is only protecting the bullets.
    armor: _queenArmor,
    armorDefault: _queenArmor,
    build: buildBroodQueen, ai: aiBroodQueen,
    cleanup: releaseMarks,
  },
};

Object.assign(ENEMY_TYPES, TYPES);
