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
// that has to be kept in step with eleven others.

import * as THREE from 'three';
import { pointInObstacle } from '../utils.js';
import {
  ENEMY_TYPES, FLY_RATE_DEFAULT, SHARED_MATS, aiMelee, bossTouch, eyes, lump,
  orbit, partsFor, prism, slab, spike,
} from './shared.js';

// ---- the theme ------------------------------------------------------------
//
// THE SWARM, SPENT AS CURRENCY. Every theme in the game buys its pressure
// with something - EMBER spends floor, SOLAR spends information, VOID spends
// position. HIVE spends BODIES, and every mechanic below is the same idea at
// a different role:
//
//   tick     dies onto a patch of honey that keeps burning where the player
//            was standing when they killed it. One is nothing; the ground
//            where a crowd of them was cleared is the ground the next crowd
//            fights on.
//   spitter  fires a simultaneous FAN of three - not a stream like a lesion,
//            a wall. The dodge is a step across the fan's line, not a sprint
//            away from the enemy.
//   borer    two halves: a plough of chitin at the front that eats most of
//            what lands on it, and a naked abdomen behind that swells as the
//            bar falls. Kill it slow and it is a walking wall; kill it fast
//            and it bursts - and the player picks which.
//   oviger   lobs an egg that hatches into a grub. The only artillery in the
//            game whose landing produces a BODY rather than ground, and the
//            answer to it is the same as the answer to a carrion: kill it
//            first, or fight what it keeps making.
//   nurse    hands out CARAPACE - a stacking, permanent damage reduction
//            that swells the body carrying it and does NOT die with the
//            nurse. A conduit's buff lapses when the conduit does; this one
//            is paid for with the same bullets that were clearing the room,
//            so the answer is to find it before the stacks land, not after.
//   weeper   the high line. It holds a wide orbit, drifts down, and sweeps a
//            slow amber sightline across the floor before firing a lance
//            along it - one long readable line from the sky, answered by
//            stepping off the arc it is drawing.
//
// THE SHARED SILHOUETTE IS THE SAC. Every body carries one: a lit amber lump
// riding the back, slung under the gut or hanging beneath a flier, always
// soft and always bright where the body is chitin. It is what makes a HIVE
// enemy read as one from across the arena before any colour resolves, and it
// is where every mechanic's tell lives - a sac swells before a spitter
// fires, before an egg is laid, and it is the borer's whole second half.
//
// SO IT IS THE THEME WHERE THE CROWD IS THE RESOURCE. Killing the front of a
// HIVE wave arms the ground the back of it is about to cross, feeds the
// nurse's stacks, and pays the oviger in time. The question it asks is not
// what to kill but in what order and where.

// ---- the honey ------------------------------------------------------------
//
// One ground for the whole theme: what every sac in it is full of. It does no
// status at all and wears the theme's own amber rather than a status colour,
// exactly as TEMPEST's shock does - the rule in HAZARD_KINDS is that a patch
// wears its STATUS's colour when it applies one, and honey applies none. It
// burns on contact and stops the moment the player is out, which is the
// entire difference between it and lava: lava is ground that has been
// burning for a while, and honey is ground that is burning NOW, left where
// something died.

export const HONEY_DPS = 8;

// The tick's burst. A body coming apart rather than a thrown canister, so it
// is wide and short-lived: it has to coat the corpse and the ground the
// player was standing on, not deny a position for ten seconds.
export const TICK_HONEY_R = 3.2;

export const TICK_HONEY_LIFE = 5.0;

// The borer's is the same stuff with a different job: it is the RUSH
// penalty, the cost of finishing a borer quickly, so it is a little wider
// and a little longer than a tick's.
export const BORER_HONEY_R = 3.4;

export const BORER_HONEY_LIFE = 5.5;

// How swollen the sac has to be before a borer's death bursts. The sac grows
// as the bar falls, so this is also the line between "killed slow" and
// "killed fast" - a borer finished above it bleeds, one finished below it
// pops.
export const BORER_BURST_SWELL = 0.55;

// How much of what lands on the plough the plate eats. Two thirds, which is
// between a bulwark's 80% and a colossus's 78%-shut - the borer is a brute
// rather than a boss, and the plate is one half of it rather than all round.
export const BORER_PLATE = 0.34;

// ---- the spitter ----------------------------------------------------------

// How wide the fan is, in radians between the arms. Narrow enough that the
// whole fan crosses a doorway, wide enough that one step clears it - the
// enemy is a lane tax, not a wall.
export const SPIT_FAN = 0.09;

export const SPIT_CD = 2.6;

export const SPIT_RANGE = 20;

// How long the sac swells before the fan leaves. Short: the swell is the
// aim, and a long one would make a support-shaped enemy out of a gunner.
export const SPIT_TELL = 0.45;

// ---- the oviger and its eggs ----------------------------------------------

// How often it lays, how far it can throw, and the tell.
export const OVIGER_CD = 4.6;

export const OVIGER_RANGE = 22;

export const OVIGER_TELL = 0.5;

// Where an egg is allowed to land: this far off the player, near end and far.
// Not on top of them - a hatching grub is not a mortar and must never be one
// - and not at the oviger's own feet either.
export const EGG_DROP_MIN = 3.5;

export const EGG_DROP_MAX = 8;

// How many grubs may be alive at once, from every oviger on the floor
// together. Counted live off the arena rather than tracked per-thrower, so
// a grub the player destroys frees its slot the same frame - the same
// contract Colossus's three turrets keep.
export const EGG_MAX_LIVE = 5;

// The egg's flight and hatch. The egg is thrown as a real arc - parametric
// and rebuilt every frame from its endpoints and one clock, exactly as a
// thrown turret's is, so the obstacle resolve cannot bend the flight - and
// the landing circle fills the whole way down, so a grub is always announced
// by the shape every other telegraph in the game already uses.
export const EGG_FLY = 1.1;

export const EGG_ARC_H = 6;

export const GRUB_HATCH = 0.55;

// What a hatched grub is worth to the player. The oviger's throw is worth
// more than what it made - killing grubs for money is a losing trade, and
// the boss's own grubs pay the same small rate.
export const GRUB_VALUE = 60;

// ---- the nurse ------------------------------------------------------------

// How far the aura reaches, how often it lands, what a stack is worth, and
// the cap. The numbers are the whole enemy:
//
//   6 stacks at 5% each, one every 2.2s, means a swarm-mate that lives in a
//   nurse's reach for thirteen seconds is a third harder to kill - and has
//   been healed a third of its bar on the way, in the same slices.
//
// The stack NEVER comes off. That is the difference between this and every
// other support in the game: a conduit's buff lapses with the conduit, a
// ward dies with the warden, a plate is spent by one hit - and carapace is
// bought with ammunition and stays bought. So the answer is to kill the
// nurse EARLY, before the stacks land, which is a decision about the first
// two seconds of a wave rather than about the middle of it.
export const NURSE_RANGE = 8;

export const NURSE_INTERVAL = 2.2;

export const NURSE_STACK = 0.05;

export const NURSE_CAP = 0.3;

// How much of the stack shows on the body: a carapace is visible as a
// swelling, sized against the enemy's own model so a chaser and a brute
// swell by the same fraction. Small on purpose - it has to read as "this
// one is getting worse", not as "this one is growing".
export const NURSE_SWELL = 0.45;

// ---- the weeper ------------------------------------------------------------

// Its station, and how far it commits to the tell. The tell is long - over
// twice a coil's charge - because it is read from the floor against a bright
// sky, and because the sweep is DRIFTING the whole time: the player is being
// shown a moving line, and they need the time to see where it is going.
export const WEEP_HIGH = 5.2;

export const WEEP_TELL = 1.2;

// How fast the swept bearing drifts, in radians a second. Slow enough to
// out-walk, fast enough that standing in the arc is a decision rather than
// an oversight.
export const WEEP_SWEEP = 0.22;

export const WEEP_RANGE = 26;

// The climb away after a shot - the weeper's bill for firing, and the
// window the whole enemy is built to hand the player.
export const WEEP_CLIMB = 1.5;

// ---- the boss --------------------------------------------------------------
//
// THE BROODMOTHER. A queen that is not carried: she drags herself about on
// claw-legs with the abdomen on the floor behind her, and everything
// dangerous in the room is something she made.
//
//   the BROOD   grubs arc in on a timer, land under a filling circle and
//               fight as ordinary rushers once they are down. Three at most,
//               refilled for as long as she lives.
//   the VOLLEY  a three-round fan off her back bulbs, telegraphed by the
//               bulbs flaring - the spitter's attack at boss scale, so the
//               player already knows how to read it.
//   the RING    she stops, the floor around her pulses for a beat, and a
//               gapped ring of honey is laid where she stands. The ring
//               travels with her in the only sense that matters: it is laid
//               where she IS, so the room fills with pockets of honey where
//               she has been, and the floor the player was using to kite
//               her on goes away a piece at a time.
//   the PANIC   under a quarter of the bar she eats her own brood for a
//   (once)     burst of speed. The only enrage in the game that costs the
//               boss something the player can see it pay.
//
// The health argument is the brood: she is a body that keeps repairing the
// room's real threat, and the fight is over when the player out-damages the
// nursery or clears the grubs faster than she can refill them.

// How many grubs she keeps and how often she refills. The arc they fly is
// EGG_ARC_H's, one size up - see BROOD_ARC_MUL, on the throw.
export const BROOD_MAX = 3;

export const BROOD_CD = 6.5;

// Her throws start two metres up rather than one, so the brood's arcs read
// taller than an oviger's from anywhere in the room: a bigger body makes a
// bigger throw, which is the only visual difference between the two.
export const BROOD_ARC_MUL = 1.2;

// How long between volleys, and the tell. The bulbs flare for the whole
// wind-up, so a player watching the boss and a player watching the room are
// reading the same clock.
export const BROOD_VOLLEY_CD = 3.4;

export const BROOD_VOLLEY_TELL = 0.5;

// The fan, in radians between the arms - the spitter's, a touch wider.
export const BROOD_VOLLEY_FAN = 0.16;

// The ring: how long she stands still to call it, how wide the band is, how
// many patches make it, and what each one costs to cross. The cap on
// honey patches does the rest of the work - an old ring is evicted by a new
// one, so the floor never fills past what the pool can draw.
export const BROOD_RING_TELL = 0.85;

export const BROOD_RING_R = 6.0;

export const BROOD_RING_N = 10;

export const BROOD_RING_PATCH_R = 2.0;

export const BROOD_RING_LIFE = 7.5;

export const BROOD_RING_DPS = 12;

// The panic: where on the bar it fires, and how often she is allowed to eat.
// The meal gap is real - a player who keeps the brood alive between meals
// keeps it, and one who clears it starves the enrage down to the speed alone.
export const BROOD_PANIC_FRAC = 0.25;

export const BROOD_PANIC_CD = 12;

export const BROOD_PANIC_SPEED = 1.35;

// Scratch, module-level and reused: the ring-laying and every burst run more
// than once a second across a whole wave.
export const _hiveAt = new THREE.Vector3();

export const _hiveTo = new THREE.Vector3();

// ---- the models -----------------------------------------------------------

// Leaning hard forward on long legs, all drill and sac. The head is the
// drill - a spiked cone taking up the whole front of the silhouette - and
// the sac rides behind it like a pack. Read: it is coming for you and it is
// carrying something.
export function buildTick(e, g, s) {
  const P = partsFor(e, g, s);
  // THE DRILL. Far bigger than a rusher's head has any right to be, swept
  // forward and down so the eye reads the enemy as all jaw.
  P('tickHead', spike(0.3, 0.68, 5), { y: 0.94, z: -0.2, rx: -Math.PI / 2.1 });
  eyes(P, { y: 1.14, x: 0.15, z: -0.42, r: 0.6, mat: e.eyeMat });
  // THE SAC, riding the back like a pack and taking up most of the mass
  // behind the head. The theme's whole signature, on the smallest body in
  // it.
  P('tickSac', lump(0.27), { y: 1.1, z: 0.26, sx: 1.15, mat: SHARED_MATS.hiveSac });
  // A small thorax under the two of them.
  P('tickThorax', prism(0.22, 0.14, 0.36, 5), { y: 0.6, z: 0.08, rx: -0.3 });
  // Long hind legs and raised mid legs - the posture of something that
  // springs rather than walks.
  P('tickLeg', slab(0.06, 0.6, 0.07), { x: -0.2, y: 0.34, rz: 0.32 });
  P('tickLeg', slab(0.06, 0.6, 0.07), { x: 0.2, y: 0.34, rz: -0.32 });
  P('tickLegUp', slab(0.05, 0.36, 0.06), { x: -0.27, y: 0.64, z: 0.16, rx: -0.9, rz: 0.5 });
  P('tickLegUp', slab(0.05, 0.36, 0.06), { x: 0.27, y: 0.64, z: 0.16, rx: -0.9, rz: -0.5 });
}

// A tall thin stalk of a body with a needle forward and the sac slung under
// the gut. Read: it is standing off, and the sac is the magazine.
export function buildSpitter(e, g, s) {
  const P = partsFor(e, g, s);
  // Narrow and upright - the needle and the sac are the silhouette and the
  // body is the stalk between them.
  P('spitThorax', prism(0.16, 0.22, 0.56, 5), { y: 0.86, rx: -0.35, ry: Math.PI / 5 });
  P('spitNeck', prism(0.12, 0.14, 0.22, 5), { y: 1.22, z: -0.14, rx: -0.6 });
  // THE NEEDLE. Long, thin, held level and forward - a barrel made of
  // chitin, and the one part of the outline that carries the aim.
  P('spitNeedle', spike(0.07, 0.8, 5), {
    y: 1.38, z: -0.36, rx: -Math.PI / 2.25, mat: SHARED_MATS.gunmetal,
  });
  // THE SAC under the gut, slung like a holster. Its swell is the wind-up -
  // a spitter has no weapon to point, so the sac is the aim.
  e.spitSac = P('spitSac', lump(0.21), { y: 0.62, z: 0.12, sy: 1.2, mat: SHARED_MATS.hiveSac });
  // Four outrigger legs, splayed wide for a body this tall and thin.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    P('spitLeg', slab(0.05, 0.44, 0.05), {
      x: Math.cos(a) * 0.3, y: 0.23, z: Math.sin(a) * 0.26,
      rz: -Math.cos(a) * 0.85, rx: Math.sin(a) * 0.5,
    });
  }
  eyes(P, { y: 1.3, x: 0.09, z: -0.3, r: 0.7, mat: e.eyeMat });
}

// A head-on wedge: a plough of chitin at the front, everything soft behind
// it. The plate is wider than the body under it, so the armoured read
// carries from any bearing. Read: the front is a wall and the back is the
// mistake.
export function buildBorer(e, g, s) {
  const P = partsFor(e, g, s);
  // THE PLOUGH. Wide, flat, tilted into the charge, and wider than anything
  // behind it - one half of the enemy, in one part.
  P('borerPlate', slab(0.74, 0.5, 0.3), {
    y: 0.94, z: -0.3, rx: 0.3, mat: SHARED_MATS.hiveChitin,
  });
  // A low wedge body tapering back.
  P('borerBody', prism(0.3, 0.18, 0.92, 5), { y: 0.68, z: 0.28, rx: -0.22, ry: Math.PI / 5 });
  // THE SAC at the rear, where the plating is not. The whole model is a
  // lesson in which end to shoot, and this is the answer - it swells as the
  // bar falls, so the mistake half gets easier to see as the fight goes on.
  e.borSac = P('borSac', lump(0.25), { y: 0.8, z: 0.78, sy: 1.1, mat: SHARED_MATS.hiveSac });
  // A small head under the plate's lip, mostly hidden - the front is for
  // pushing, not looking.
  P('borerHead', prism(0.13, 0.16, 0.24, 5), { y: 0.6, z: -0.6, rx: -1.1 });
  eyes(P, { y: 0.66, x: 0.1, z: -0.72, r: 0.7, mat: e.eyeMat });
  // Six stub legs, three a side - short and strong, the legs of a thing
  // that pushes rather than runs.
  for (let i = 0; i < 6; i++) {
    const side = i % 2 ? 1 : -1;
    const k = Math.floor(i / 2);
    P('borerLeg', slab(0.07, 0.32, 0.07), {
      x: side * 0.3, y: 0.15, z: -0.36 + k * 0.42, rz: side * 0.3,
    });
  }
}

// A fat carrier. The whole model is bottom-heavy: a wide low beetle of a
// body, six legs, and the egg cluster riding the back as three lumps - the
// only artillery in the roster whose cargo is visible on it.
export function buildOviger(e, g, s) {
  const P = partsFor(e, g, s);
  // THE CLUSTER. Three eggs riding the back, standing proud of the outline -
  // what the enemy throws is on the enemy, which no other artillery in the
  // game can say.
  e.ovEggs = [
    P('ovEgg', lump(0.19), { x: -0.22, y: 1.18, z: 0.16, mat: SHARED_MATS.hiveSac }),
    P('ovEgg', lump(0.2), { y: 1.28, z: 0.06, mat: SHARED_MATS.hiveSac }),
    P('ovEgg', lump(0.17), { x: 0.24, y: 1.16, z: 0.14, mat: SHARED_MATS.hiveSac }),
  ];
  // A broad low body under the cluster.
  P('ovBody', lump(0.4), { y: 0.58, sx: 1.25, sy: 0.85, sz: 1.1 });
  // A carapace shell over the front half, the plough's material - the HIVE
  // read of "armoured where it is hard, soft where it carries".
  P('ovShell', prism(0.36, 0.44, 0.5, 5), {
    y: 0.72, z: -0.2, rx: -0.34, ry: Math.PI / 5, mat: SHARED_MATS.hiveChitin,
  });
  // A small head under the shell's lip.
  P('ovHead', prism(0.12, 0.14, 0.24, 5), { y: 0.5, z: -0.52, rx: -1.15 });
  eyes(P, { y: 0.56, x: 0.09, z: -0.62, r: 0.7, mat: e.eyeMat });
  // Six legs, short and splayed, carrying a belly close to the floor.
  for (let i = 0; i < 6; i++) {
    const side = i % 2 ? 1 : -1;
    const k = Math.floor(i / 2);
    P('ovLeg', slab(0.06, 0.3, 0.06), {
      x: side * 0.34, y: 0.14, z: -0.32 + k * 0.36, rz: side * 0.35,
    });
  }
}

// A small dark body entirely in service of the one enormous sac it carries,
// which rides it like a lantern. No head worth naming, no weapon, no armour -
// killing one is a decision about the rest of the wave rather than about the
// nurse itself.
export function buildNurse(e, g, s) {
  const P = partsFor(e, g, s);
  // THE LANTERN-SAC. Most of the model by volume, held high on a short
  // stalk, and the only bright thing on the field - a nurse is found by its
  // glow before its shape.
  e.nurSac = P('nurSac', lump(0.33), { y: 1.32, sy: 1.15, mat: SHARED_MATS.hiveSac });
  P('nurStalk', prism(0.09, 0.11, 0.38, 5), { y: 0.98, z: 0.02, rx: 0.1 });
  // The body under it: small, dark, bowed under the weight.
  P('nurThorax', prism(0.2, 0.26, 0.42, 5), { y: 0.6, z: 0.04, rx: 0.24, ry: Math.PI / 5 });
  P('nurAbdomen', prism(0.13, 0.09, 0.32, 5), { y: 0.48, z: 0.34, rx: 0.4 });
  P('nurHead', prism(0.09, 0.11, 0.16, 5), { y: 0.74, z: -0.24, rx: -0.7 });
  eyes(P, { y: 0.78, x: 0.07, z: -0.34, r: 0.6, mat: e.eyeMat });
  // Four long thin legs, splayed far wider than the body - the read of a
  // thing that is carried about rather than one that lives anywhere.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    P('nurLeg', slab(0.04, 0.56, 0.04), {
      x: Math.cos(a) * 0.3, y: 0.27, z: Math.sin(a) * 0.26,
      rz: -Math.cos(a) * 0.95, rx: Math.sin(a) * 0.55,
    });
  }
}

// The high line. A small hunched thorax with an enormous unsupported sac
// hanging under it - far too big for the body above, which is the read: the
// cargo is the enemy. Two ragged vanes swept back, and the lance a long thin
// probe under the chin that visibly follows the sweep.
export function buildWeeper(e, g, s) {
  const P = partsFor(e, g, s);
  // THE SAC, slung under the body and wider than the body above it - the
  // opposite of every other flier's clean hull, and the reason this one
  // reads as hanging cargo rather than as a flying thing.
  e.weepSac = P('weepSac', lump(0.33), { y: 0.42, sy: 1.15, mat: SHARED_MATS.hiveSac });
  P('weepThorax', prism(0.18, 0.24, 0.4, 5), { y: 0.92, z: 0.04, rx: 0.3 });
  // THE LANCE, held forward under the chin. The tell turns it: the whole
  // enemy is one long read of where this is pointing.
  P('weepLance', spike(0.05, 0.54, 4), {
    y: 0.76, z: -0.28, rx: -Math.PI / 2.2, mat: SHARED_MATS.gunmetal,
  });
  // Two ragged vanes swept back hard. No fuselage and no tail - the mass is
  // all in the sac below and the vanes above.
  P('weepVane', slab(0.62, 0.04, 0.2), { x: -0.4, y: 1.1, z: 0.14, ry: 0.55, rz: 0.24 });
  P('weepVane', slab(0.62, 0.04, 0.2), { x: 0.4, y: 1.1, z: 0.14, ry: -0.55, rz: -0.24 });
  // A small head under the thorax looking down - the enemy is read from
  // below, and the eyes looking back is part of the read.
  P('weepHead', prism(0.1, 0.14, 0.2, 5), { y: 0.64, z: -0.26, rx: -1.4 });
  eyes(P, { y: 0.68, x: 0.08, z: -0.38, r: 0.65, mat: e.eyeMat });
}

// A grub: three soft lumps in a row with a tiny head and a speck of sac.
// Nothing about it is armed or plated - it is a larva, and it is meant to be
// read as a thing that was THROWN.
export function buildGrub(e, g, s) {
  const P = partsFor(e, g, s);
  P('grubBody', lump(0.26), { y: 0.4, sx: 0.9, sy: 0.8, sz: 1.5 });
  P('grubHind', lump(0.17), { y: 0.36, z: 0.4, sy: 0.85 });
  // The one bright speck: the sac it is carrying ahead of it. A grub is an
  // egg that opened, and the sac is what was inside.
  P('grubSac', lump(0.11), { y: 0.44, z: -0.32, mat: SHARED_MATS.hiveSac });
  P('grubHead', prism(0.09, 0.12, 0.18, 5), { y: 0.42, z: -0.48, rx: -1.2 });
  eyes(P, { y: 0.48, x: 0.07, z: -0.52, r: 0.55, mat: e.eyeMat });
}

// THE BROODMOTHER. The abdomen is a third of the model and almost all of its
// mass, dragging on the floor behind the armoured thorax. The bulbs on her
// back are the brood - they swell as the next refill nears and flare when a
// volley is coming, so the nursery reads from anywhere in the room.
export function buildBroodmother(e, g, s) {
  const P = partsFor(e, g, s);
  // THE ABDOMEN. The theme's sac at boss scale: enormous, veined, lit, and
  // dragging - a queen's body, and the one part of the fight the player
  // never has any reason to shoot.
  P('broodAbd', lump(0.62), {
    y: 0.6, z: 1.08, sx: 1.5, sy: 1.05, sz: 1.8, mat: SHARED_MATS.hiveSac,
  });
  // The thorax, armoured in the borer's plate material - the two halves of
  // the theme on one body: chitin in front, cargo behind.
  P('broodThorax', prism(0.52, 0.36, 0.86, 6), {
    y: 0.98, z: 0.18, sz: 0.9, mat: SHARED_MATS.hiveChitin,
  });
  // THE BULBS. One per live grub, riding the thorax. Driven every frame by
  // aiBroodmother - they swell toward the next refill and flare for the
  // volley, which is the whole nursery read at a distance.
  e.bs.bulbs = [];
  for (let i = 0; i < 3; i++) {
    const b = P('broodBulb', lump(0.15), {
      x: (i - 1) * 0.3, y: 1.68, z: 0.22, mat: SHARED_MATS.hiveSac,
    });
    e.bs.bulbs.push(b);
  }
  // A crown of small horns - regal without being tall, so the silhouette
  // still reads as cargo rather than as a tower.
  for (let i = 0; i < 3; i++) {
    P('broodHorn', spike(0.05, 0.32, 4), {
      x: (i - 1) * 0.26, y: 1.46, z: -0.2, rx: -0.4, rz: (i - 1) * 0.2,
      mat: SHARED_MATS.hiveChitin,
    });
  }
  // The head, low and small against the bulk, with mandibles rather than a
  // jaw - a queen's head is not what she is for.
  P('broodHead', prism(0.2, 0.24, 0.34, 6), { y: 1.04, z: -0.42, rx: -0.5 });
  P('broodMandible', spike(0.04, 0.28, 4), {
    x: -0.14, y: 0.94, z: -0.56, rx: -Math.PI / 2.3, rz: 0.3,
  });
  P('broodMandible', spike(0.04, 0.28, 4), {
    x: 0.14, y: 0.94, z: -0.56, rx: -Math.PI / 2.3, rz: -0.3,
  });
  eyes(P, { y: 1.12, x: 0.14, z: -0.5, r: 1.0, mat: e.eyeMat });
  // THE CLAW-LEGS. Four, long and reaching, carrying the thorax high while
  // the abdomen drags - the posture of a thing that moves slowly because it
  // chooses to.
  for (let i = 0; i < 4; i++) {
    const side = i % 2 ? 1 : -1;
    const fore = i < 2 ? -1 : 1;
    P('broodLeg', slab(0.11, 1.22, 0.11), {
      x: side * 0.6, y: 0.6, z: fore * 0.4, rz: side * 0.5, rx: fore * 0.34,
    });
    P('broodClaw', spike(0.09, 0.38, 4), {
      x: side * 0.76, y: 0.04, z: fore * 0.64, rx: Math.PI, rz: side * 0.4,
      mat: SHARED_MATS.hiveChitin,
    });
  }
}

// ---- the AI ----------------------------------------------------------------

// The tick. The shared melee cycle and nothing else - the enemy's whole
// second half is in the type's onDeath, and the AI is the honest description
// of the first half: a rusher.
export function aiTick(e, a) {
  aiMelee(e, a);
}

// The spitter. A simultaneous fan of three: all three leave on the same
// frame, so what crosses a lane is a wall for one moment rather than a
// stream for half a second. The sac swells into the shot - the swell IS the
// wind-up, there being no weapon to point.
export function aiSpitter(e, a) {
  orbit(e, a, ENEMY_TYPES.spitter.orbit);
  if (e.spitT > 0) {
    e.spitT -= a.dt;
    const k = 1 - Math.max(0, e.spitT) / SPIT_TELL;
    if (e.spitSac) e.spitSac.scale.setScalar((0.85 + k * 0.45) * e.scale);
    if (e.spitT > 0) return;
    // The sac snaps flat as the fan leaves, so the moment of the shot and
    // the moment of the tell's end are one event.
    if (e.spitSac) e.spitSac.scale.setScalar(0.85 * e.scale);
    e._setEyeAlert(false);
    for (let i = -1; i <= 1; i++) {
      a.ctx.addProjectile(e.pos.x, 1.05, e.pos.z, 'spitter', e._projScale(), i * SPIT_FAN);
    }
    _hiveAt.set(e.pos.x, 1.05, e.pos.z);
    if (a.ctx.effects) a.ctx.effects.burst(_hiveAt, 0xffd54f, 8, 3, 2, 0.4);
    return;
  }
  if (e.attackCd > 0 || a.dist > SPIT_RANGE) return;
  e.attackCd = SPIT_CD + Math.random() * 0.8;
  e.spitT = SPIT_TELL;
  e.flash = 0.14;
  e._setEyeAlert(true);
}

// The borer. The AI is the shared melee cycle plus the sac's clock: the sac
// eases toward (1 - health fraction), so it swells as the player wins, and
// the burst at the end is the rush penalty priced off that same number.
// Everything else about the enemy is on the stat block - the plate in
// armor(), the burst in onDeath - because the enemy IS its stat block, which
// is the brute role's whole argument.
export function aiBorer(e, a) {
  aiMelee(e, a);
  const frac = Math.max(0, Math.min(1, e.hp / e.maxHp));
  e.borSwell = (e.borSwell ?? 0) + ((1 - frac) - (e.borSwell ?? 0)) * Math.min(1, a.dt * 3);
  if (e.borSac) e.borSac.scale.setScalar((0.8 + e.borSwell * 0.7) * e.scale);
}

// Where the next egg comes down, into _hiveTo's x and z. Returns false when
// eight tries found nothing usable, in which case the oviger simply does not
// lay this time - the cooldown is charged on the THROW, never on the attempt.
export function _pickEggSpot(e, a) {
  const p = a.ctx.player;
  const off = Math.max(EGG_DROP_MIN, Math.min(EGG_DROP_MAX, 3 + a.dist * 0.3));
  for (let i = 0; i < 8; i++) {
    const ang = Math.random() * Math.PI * 2;
    const r = off * (0.8 + Math.random() * 0.5);
    const x = p.pos.x + Math.cos(ang) * r;
    const z = p.pos.z + Math.sin(ang) * r;
    if (Math.abs(x) > 20 || Math.abs(z) > 20) continue;
    // Not under the oviger either - an egg hatching in its own collision
    // would be shoved apart the same frame, and a grub that slides is a
    // grub the player cannot read.
    if (Math.hypot(x - e.pos.x, z - e.pos.z) < e.radius + 1.5) continue;
    _hiveAt.set(x, 0.4, z);
    if (pointInObstacle(_hiveAt, a.ctx.obstacles)) continue;
    _hiveTo.set(x, 0, z);
    return true;
  }
  return false;
}

// How many grubs are alive right now, from every oviger and the boss
// together. Counted off the live roster rather than tracked anywhere, so a
// grub the player kills frees its slot the same frame.
function _grubsAlive(ctx) {
  let n = 0;
  for (const o of ctx.enemies) {
    if (!o.dead && o.type === 'grub') n++;
  }
  return n;
}

// The oviger. Orbits, swells its cluster toward the next throw, then lays:
// the egg is a real enemy spawned at the OVIGER'S OWN POSITION with its
// flight already set (the thrown-turret contract - the arc is parametric in
// the grub's own ai, so nothing in the engine's movement can bend it), and
// the landing circle fills the whole way down.
export function aiOviger(e, a) {
  orbit(e, a, ENEMY_TYPES.oviger.orbit);
  if (e.ovT > 0) {
    e.ovT -= a.dt;
    const k = 1 - Math.max(0, e.ovT) / OVIGER_TELL;
    for (const egg of e.ovEggs) egg.scale.setScalar((0.9 + k * 0.35) * e.scale);
    if (e.ovT > 0) return;
    for (const egg of e.ovEggs) egg.scale.setScalar(0.9 * e.scale);
    e._setEyeAlert(false);
    if (_pickEggSpot(e, a) && a.ctx.addAnchor) {
      const grub = a.ctx.addAnchor(e.pos.x, e.pos.z, 'grub');
      if (grub) {
        grub.eggFromX = e.pos.x;
        grub.eggFromZ = e.pos.z;
        grub.eggFromY = 1.1;
        grub.eggToX = _hiveTo.x;
        grub.eggToZ = _hiveTo.z;
        grub.eggArcH = EGG_ARC_H;
        grub.eggT = 0;
        grub.grubMark = -1;
        // THE GRUB RIDES THE THROWER'S SCALING. addAnchor multiplies neither
        // speed nor damage - an anchor never moves and never hits, so there
        // is nothing there to multiply - and a grub does both. Its pace is
        // taken off the oviger's own wave-scaled speed and its bite off the
        // oviger's `damage`, which exists for exactly this: see the type.
        grub.speed = e.speed * 1.8;
        grub.damage = e.damage;
        _hiveAt.set(e.pos.x, 1.2, e.pos.z);
        a.ctx.effects.burst(_hiveAt, 0xffd54f, 14, 4, 2, 0.5);
        a.ctx.effects.addShake(0.1);
      }
    }
    return;
  }
  if (e.attackCd > 0 || a.dist > OVIGER_RANGE) return;
  // The cap is checked BEFORE the tell rather than the throw, so an oviger
  // on a floor already at the cap never stands still swelling at nothing.
  if (_grubsAlive(a.ctx) >= EGG_MAX_LIVE) return;
  e.attackCd = OVIGER_CD + Math.random() * 1.2;
  e.ovT = OVIGER_TELL;
  e.flash = 0.14;
  e._setEyeAlert(true);
}

// The nurse. Every interval, every swarm-mate in range gains a stack of
// carapace and a slice of healing in the same breath. The exclusion list is
// the conduit's, for the conduit's reason: an invisible multiplier on a
// boss is length the player cannot see the source of, and a nurse buffing
// another nurse would be two of them compounding invisibly.
export function aiNurse(e, a) {
  orbit(e, a, ENEMY_TYPES.nurse.orbit);
  // The lantern pulses on its own slow clock - a nurse at rest is still a
  // nurse, and the pulse is what says so.
  if (e.nurSac) {
    e.nurSac.scale.setScalar((1 + Math.sin(a.ctx.time * 2.4 + e.id) * 0.12) * e.scale);
  }
  e.nurCd = (e.nurCd || 0) - a.dt;
  const ready = e.nurCd <= 0;
  e._setEyeAlert(ready);
  if (!ready) return;
  e.nurCd = NURSE_INTERVAL;

  let n = 0;
  for (const o of a.ctx.enemies) {
    if (o === e || o.dead || o.boss || o.type === 'nurse') continue;
    const dx = o.pos.x - e.pos.x;
    const dz = o.pos.z - e.pos.z;
    if (dx * dx + dz * dz > NURSE_RANGE * NURSE_RANGE) continue;
    // CARAPACE. Capped, and the cap is what makes a nurse a slow burn
    // rather than a wall: a third off, at most, and only after thirteen
    // seconds of standing in reach of her.
    o.carapace = Math.min(NURSE_CAP, o.carapace + NURSE_STACK);
    // The slice of healing is a fraction of the TARGET's max, taken as
    // part of the same stack, so it is worth the same on a chaser as on a
    // borer and never overheals.
    o.hp = Math.min(o.maxHp, o.hp + o.maxHp * NURSE_STACK);
    // The swelling is the visible half of the stack - a carapace has no
    // chip and no tint, and the body growing a little worse is the only
    // honest way left to show one.
    o.group.scale.setScalar(1 + o.carapace * NURSE_SWELL);
    n++;
    if (a.ctx.effects) a.ctx.effects.beam(e.pos, o.pos, 0xffb300);
  }
  if (n && a.ctx.effects) {
    _hiveAt.set(e.pos.x, 1.4, e.pos.z);
    a.ctx.effects.burst(_hiveAt, 0xffd54f, 10, 3, 2, 0.4);
  }
}

// The weeper. Three states and a readable loop: a wide lazy orbit, a long
// slow drift down with an amber line sweeping the floor beneath it, and a
// climb away after the lance. The sweep is the whole enemy - one long
// telegraphed line, answered by stepping off the arc it is drawing.
export function aiWeeper(e, a) {
  const ctx = a.ctx;
  if (e.weepState === undefined) {
    e.weepState = 'orbit';
    e.weepCd = 1.6 + Math.random() * 1.6;
    // The swept bearing, in atan2(dz, dx) convention so it composes
    // directly with the spread the projectile spawn takes.
    e.weepAng = 0;
  }

  if (e.weepState === 'tell') {
    e.weepT -= a.dt;
    e._setEyeAlert(true);
    // Drifting down through the whole tell. Everything else in the arena
    // is on the floor, so a thing descending is the read that carries.
    e.hoverY = WEEP_HIGH - 1.4;
    e.flyRate = 4;
    a.vx = 0;
    a.vz = 0;
    // The line advances at a constant rate and the body follows it, so
    // the player is watching a needle move across a dial with them on it.
    e.weepAng += WEEP_SWEEP * a.dt;
    e.faceLocked = true;
    // Facing convention: update() writes rotation.y = atan2(-dx, -dz) to
    // face along (dx, dz), so a bearing of (cos, sin) needs the same
    // transform run backwards.
    e.group.rotation.y = Math.atan2(-Math.cos(e.weepAng), -Math.sin(e.weepAng));
    if (ctx.effects) {
      _hiveAt.set(e.pos.x, e.pos.y - 0.35, e.pos.z);
      _hiveTo.set(
        e.pos.x + Math.cos(e.weepAng) * 30,
        e.pos.y - 0.35,
        e.pos.z + Math.sin(e.weepAng) * 30
      );
      ctx.effects.beam(_hiveAt, _hiveTo, 0xffb300);
    }
    if (e.weepT > 0) return;
    e.weepState = 'climb';
    e.weepT = WEEP_CLIMB;
    e._setEyeAlert(false);
    // THE LANCE, fired along the swept bearing and nowhere else. The
    // projectile aims at the player by construction, so the spread passed
    // here is the rotation that turns that aim onto the line - which is
    // the entire mechanic: the shot goes where the line went, not where
    // the player is.
    const p = ctx.player;
    if (p) {
      const base = Math.atan2(p.pos.z - e.pos.z, p.pos.x - e.pos.x);
      ctx.addProjectile(e.pos.x, e.pos.y - 0.2, e.pos.z, 'weeper', 1, e.weepAng - base);
    }
    _hiveAt.set(e.pos.x, e.pos.y - 0.2, e.pos.z);
    if (ctx.effects) ctx.effects.burst(_hiveAt, 0xffd54f, 10, 4, 2, 0.35);
    return;
  }

  if (e.weepState === 'climb') {
    e.weepT -= a.dt;
    e.hoverY = WEEP_HIGH;
    e.flyRate = 2;
    e.faceLocked = false;
    if (e.weepT <= 0) {
      e.weepState = 'orbit';
      e.weepCd = 2.2 + Math.random() * 1.6;
    }
    return;
  }

  // orbit
  orbit(e, a, ENEMY_TYPES.weeper.orbit);
  e.hoverY = WEEP_HIGH;
  e.flyRate = FLY_RATE_DEFAULT;
  e.faceLocked = false;
  e.weepCd -= a.dt;
  const ready = e.weepCd <= 0;
  e._setEyeAlert(ready && a.dist < WEEP_RANGE);
  // The sac fills toward the shot - the weeper has no weapon to point, so
  // the sac is the wind-up exactly as a spitter's is.
  if (e.weepSac) {
    const k = Math.max(0, 1 - e.weepCd / 3.8);
    e.weepSac.scale.setScalar((0.8 + k * 0.5) * e.scale);
  }
  if (ready && a.dist < WEEP_RANGE) {
    e.weepState = 'tell';
    e.weepT = WEEP_TELL;
    // The sweep starts on the player and drifts. A player who stands still
    // is the player the arc crosses; a player who walks with it is the
    // player it misses - which is the whole answer, arrived at by reading
    // one arc.
    const p = ctx.player;
    if (p) {
      e.weepAng = Math.atan2(p.pos.z - e.pos.z, p.pos.x - e.pos.x);
    }
  }
}

// A grub, thrown. Three states, and the first two are the oviger's and the
// boss's shared telegraph:
//
//   fly    a parametric arc from the thrower to the landing spot, with the
//          circle filling the whole way down - the thrown-turret contract,
//          so the obstacle resolve cannot bend the flight.
//   hatch  the grub stands on the spot growing from a tenth of itself to
//          full over half a second. It is shootable throughout - an egg
//          that had to be waited out would be a cutscene, not an enemy.
//   live   an ordinary rusher from then on, with the melee its stat block
//          names.
export function aiGrub(e, a) {
  const ctx = a.ctx;
  if (e.eggT !== undefined) {
    a.vx = 0;
    a.vz = 0;
    e.eggT += a.dt;
    const u = Math.min(1, e.eggT / EGG_FLY);
    e.pos.x = e.eggFromX + (e.eggToX - e.eggFromX) * u;
    e.pos.z = e.eggFromZ + (e.eggToZ - e.eggFromZ) * u;
    // One parabola from the thrower's back to the floor. The launch height
    // and the peak are the thrower's - an oviger lobs from a metre up and the
    // Broodmother from two - and the linear term carries the launch height
    // away as the arc term brings the egg down, exactly as a thrown turret's
    // flight does.
    const fromY = e.eggFromY || 1.1;
    e.pos.y = fromY * (1 - u) + (e.eggArcH || EGG_ARC_H) * 4 * u * (1 - u);
    // Kept current every frame of the flight, so a grub shot out of the
    // air can hand its telegraph handle back from wherever it died - the
    // same contract the thrown turret's mark keeps.
    e._fx = ctx.effects;
    // The landing circle fills as it falls, exactly as a mortar's does -
    // the player has already been taught to read this shape. The handle is
    // claimed HERE rather than by the thrower, so every path that makes a
    // grub - an oviger's egg, the boss's brood - gets its ring from the
    // one place that owns the flight, and a dry pool degrades to an
    // untelegraphed egg rather than to a thrown error.
    if (e.grubMark < 0) e.grubMark = ctx.effects.markAcquire();
    if (u < 1) {
      ctx.effects.markSet(e.grubMark, e.eggToX, e.eggToZ, 1.4, 0xffb300, u);
      return;
    }
    // Down. The mark goes back, the hatch begins, and the grub is live.
    if (e.grubMark >= 0) ctx.effects.markRelease(e.grubMark);
    e.grubMark = -1;
    e.pos.y = 0;
    e.eggT = undefined;
    e.hatchT = GRUB_HATCH;
    e.group.scale.setScalar(0.15);
    _hiveAt.set(e.pos.x, 0.3, e.pos.z);
    ctx.effects.burst(_hiveAt, 0xffd54f, 12, 4, 2, 0.4);
    return;
  }
  if (e.hatchT > 0) {
    e.hatchT -= a.dt;
    a.vx = 0;
    a.vz = 0;
    e._setEyeAlert(true);
    // Growing, not popping: the scale climbs the same curve every frame
    // so the hatch reads as one continuous motion.
    const k = 1 - Math.max(0, e.hatchT) / GRUB_HATCH;
    e.group.scale.setScalar(0.15 + k * 0.85);
    if (e.hatchT > 0) return;
    e.group.scale.setScalar(1);
    e._setEyeAlert(false);
  }
  aiMelee(e, a);
}

// A grub killed mid-flight is still holding a telegraph handle, and the mark
// pool is shared with every boss's own warnings - leaked, the pool empties
// one throw at a time until a later boss cannot warn the player at all.
export function releaseGrub(e) {
  if (e.grubMark >= 0 && e._fx) e._fx.markRelease(e.grubMark);
  e.grubMark = -1;
}

// ---- the boss -------------------------------------------------------------

export function aiBroodmother(e, a) {
  const bs = e.bs;
  const ctx = a.ctx;
  if (bs.state === undefined) {
    bs.state = 'walk';
    bs.broodCd = 1.5;
    bs.volleyCd = 2.4;
    bs.volleyTell = 0;
    bs.ringTell = 0;
    bs.ringCd = 5;
    bs.panicAt = false;
    bs.panicCd = 0;
    bs.brood = [];
  }

  // Standing on her costs, in every state - she is a slow boss and this is
  // what stops "hug the queen" being the whole fight.
  bossTouch(e, a);

  // THE BULBS, driven every frame: they swell toward the next refill and
  // flare during a volley's tell, so the nursery's state is on the boss's
  // back rather than in anybody's imagination.
  const nextIn = Math.max(0, Math.min(1, bs.broodCd / BROOD_CD));
  for (const b of bs.bulbs) {
    b.rotation.y += a.dt * 0.8;
    if (bs.volleyTell > 0) b.scale.setScalar(1.6 * e.scale);
    else b.scale.setScalar((0.6 + (1 - nextIn) * 0.8) * e.scale);
  }

  // ---- the ring -----------------------------------------------------------
  // A claim on the floor where she is standing: a beat of warning, a pulse
  // at the radius, then a gapped ring of honey laid in one frame. She walks
  // on and the ring stays behind, so over a fight the room fills with
  // pockets of honey where she has been.
  if (bs.ringTell > 0) {
    bs.ringTell -= a.dt;
    a.vx = 0;
    a.vz = 0;
    e._setEyeAlert(true);
    if (ctx.effects) {
      _hiveAt.set(e.pos.x, 0.12, e.pos.z);
      ctx.effects.shockwave(_hiveAt, 0xffb300, BROOD_RING_R, 0.16);
    }
    if (bs.ringTell <= 0) {
      e._setEyeAlert(false);
      bs.ringCd = 9 * e.rate;
      const off = Math.random() * Math.PI * 2;
      // A GAP IN THE RING, rotated at random: a closed ring with the boss
      // inside it would be a wall with the player's own kite lane gone,
      // and the gap is what makes the ring a question rather than a jail.
      const gapAt = (Math.random() * BROOD_RING_N) | 0;
      for (let i = 0; i < BROOD_RING_N; i++) {
        if (i === gapAt || i === (gapAt + 1) % BROOD_RING_N) continue;
        const ang = off + (i / BROOD_RING_N) * Math.PI * 2;
        ctx.addHazard(
          e.pos.x + Math.cos(ang) * BROOD_RING_R,
          e.pos.z + Math.sin(ang) * BROOD_RING_R,
          BROOD_RING_PATCH_R, BROOD_RING_LIFE, BROOD_RING_DPS, 'hiveblood'
        );
      }
      _hiveAt.set(e.pos.x, 0.1, e.pos.z);
      ctx.effects.shockwave(_hiveAt, 0xffb300, BROOD_RING_R + 2, 0.4);
      ctx.effects.addShake(0.2);
      if (ctx.sfx) ctx.sfx.impact();
    }
    return;
  }

  // ---- the volley ---------------------------------------------------------
  if (bs.volleyTell > 0) {
    bs.volleyTell -= a.dt;
    if (bs.volleyTell <= 0) {
      // THE FAN, off the bulbs: the spitter's attack at boss scale, so the
      // player meets it already knowing how to read it.
      const y = 1.1 * (e.group.scale.y || 1);
      for (let i = -1; i <= 1; i++) {
        ctx.addProjectile(e.pos.x, y, e.pos.z, 'broodmother', 1, i * BROOD_VOLLEY_FAN);
      }
      _hiveAt.set(e.pos.x, y, e.pos.z);
      ctx.effects.burst(_hiveAt, 0xffd54f, 14, 5, 2, 0.4);
    }
  } else {
    bs.volleyCd -= a.dt;
    if (bs.volleyCd <= 0 && a.dist < 26) {
      bs.volleyCd = BROOD_VOLLEY_CD * e.rate;
      bs.volleyTell = BROOD_VOLLEY_TELL;
      e.flash = 0.15;
    }
  }

  // ---- the brood ----------------------------------------------------------
  // Refill on a timer up to the cap. A dead grub frees its slot through the
  // list itself, so the cap is checked live - a player clearing the brood
  // faster simply faces a room that keeps refilling, never one that stops.
  bs.brood = bs.brood.filter((q) => q && !q.dead);
  bs.broodCd -= a.dt;
  if (bs.broodCd <= 0 && bs.brood.length < BROOD_MAX) {
    bs.broodCd = BROOD_CD * e.rate;
    const p = ctx.player;
    // Thrown NEAR the player rather than at them - the brood is pressure
    // on the player's position, and the landing ring is the warning.
    let sx = p.pos.x;
    let sz = p.pos.z;
    for (let tries = 0; tries < 8; tries++) {
      const ang = Math.random() * Math.PI * 2;
      const rad = 5 + Math.random() * 5;
      sx = Math.max(-20, Math.min(20, p.pos.x + Math.cos(ang) * rad));
      sz = Math.max(-20, Math.min(20, p.pos.z + Math.sin(ang) * rad));
      if (Math.hypot(sx - e.pos.x, sz - e.pos.z) > e.radius + 2) break;
    }
    if (ctx.addAnchor) {
      const grub = ctx.addAnchor(e.pos.x, e.pos.z, 'grub');
      if (grub) {
        grub.eggFromX = e.pos.x;
        grub.eggFromZ = e.pos.z;
        grub.eggToX = sx;
        grub.eggToZ = sz;
        grub.eggFromY = 1.6;
        grub.eggArcH = EGG_ARC_H * BROOD_ARC_MUL;
        grub.eggT = 0;
        grub.grubMark = -1;
        // Her grubs bite with her own scaled damage - the brood is the
        // boss's reach, and a reach that did not scale would be decoration.
        grub.damage = e.damage * 0.6;
        bs.brood.push(grub);
        _hiveAt.set(e.pos.x, 1.6, e.pos.z);
        ctx.effects.burst(_hiveAt, 0xffd54f, 16, 5, 3, 0.6);
      }
    }
  }

  // ---- the panic -----------------------------------------------------------
  // Under a quarter of the bar she starts eating the brood for speed. The
  // meal is the tell and the price both: every grub consumed is one the
  // player can see go, and a player who kept the brood cleared takes
  // nothing from this phase but the speed itself.
  bs.panicCd -= a.dt;
  if (!bs.panicAt && e.hp <= e.maxHp * BROOD_PANIC_FRAC) {
    bs.panicAt = true;
    bs.panicCd = 0;
  }
  if (bs.panicAt && bs.panicCd <= 0 && bs.brood.length) {
    bs.panicCd = BROOD_PANIC_CD;
    for (const q of bs.brood) {
      if (!q.dead) {
        // Through takeDamage so the kill path, the sweep and the payouts
        // all see it - a boss deleting its own adds by hand would have to
        // re-implement three of them.
        q.takeDamage(q.hp + 1, true);
      }
    }
    bs.brood.length = 0;
    e.speed *= BROOD_PANIC_SPEED;
    e.flash = 0.2;
    ctx.bossEvent('enrage', e);
    _hiveAt.set(e.pos.x, 1.2, e.pos.z);
    ctx.effects.burst(_hiveAt, 0xffd54f, 30, 7, 3, 0.8);
    ctx.effects.addShake(0.3);
  }

  // ---- walking, and the ring's call ---------------------------------------
  aiMelee(e, a);
  bs.ringCd -= a.dt;
  if (bs.ringCd <= 0 && a.dist > 5) {
    bs.ringTell = BROOD_RING_TELL;
    e.flash = 0.18;
  }
}

const TYPES = {
  // ---- HIVE ----------------------------------------------------------------
  //
  // The theme of the SWARM, SPENT AS CURRENCY. Six enemies and a boss, every
  // one of them reading as one family through the amber sac each carries -
  // and every one of them more dangerous for the company it keeps.

  // A rusher that is more work to kill near than far. Its death leaves a
  // patch of burning honey over its own corpse, which is where the player
  // was standing when they killed it - so the ground a crowd of them is
  // cleared on is the ground the next crowd fights on.
  //
  // The onDeath makes it an AFFLICTOR by the law in test/themes.mjs, and its
  // damage sits in the lower half of the rusher band for that reason: the
  // patch is the payment, and a tick that hit for a full rusher's damage AND
  // burnt the floor would simply be a better rusher.
  tick: {
    head: { r: 0.28, y: 1.0 },
    hp: 40, speed: 3.5, damage: 8, value: 190, color: 0x8a6d1a, eye: 0xffe08a,
    scale: 0.95, radius: 0.46, mass: 1,
    melee: { windup: 0.4, start: 1.4, hit: 2.0, cd: 1.0 },
    onDeath: (e, ctx) => {
      ctx.addHazard(e.pos.x, e.pos.z, TICK_HONEY_R, TICK_HONEY_LIFE, HONEY_DPS, 'hiveblood');
      if (ctx.effects) {
        _hiveAt.set(e.pos.x, Math.max(0.6, e.pos.y), e.pos.z);
        ctx.effects.burst(_hiveAt, 0xffd54f, 24, 5, 2.4, 0.7);
      }
    },
    build: buildTick, ai: aiTick,
  },

  // A gunner that fires a simultaneous FAN of three. Not a stream, a wall:
  // all three rounds leave on the same frame, so what crosses a lane is one
  // moment of three lines - and the dodge is a step ACROSS the fan, not a
  // sprint away from the enemy. Where a lesion's spread is a tax on the
  // ground behind the player, this one is a tax on the lane they are
  // standing in.
  spitter: {
    head: { r: 0.28, y: 1.3 },
    hp: 26, speed: 2.3, damage: 9, value: 230, color: 0xa07c20, eye: 0xffe08a,
    scale: 1.0, radius: 0.48, mass: 1,
    orbit: { dist: 12, band: 2.5, out: 0.8, in: -0.65, strafe: 0.45, flip: 1.8, flipVar: 2 },
    proj: {
      core: 0xffe08a, glow: 0xffb300, scale: 0.6,
      speed: [17, 0.3, 25], dmg: [8, 0.35, 13],
    },
    build: buildSpitter, ai: aiSpitter,
  },

  // A brute in two halves. The front is a plough of chitin that eats two
  // thirds of anything landing on it; the back is a naked abdomen and the
  // sac, and the sac swells as the bar falls. Finished slow, a borer is a
  // walking wall; finished fast, it bursts - and the player picks which.
  //
  // The onDeath makes it an AFFLICTOR, and its damage sits in the lower
  // half of the brute band accordingly.
  borer: {
    head: { r: 0.3, y: 0.78 },
    hp: 150, speed: 1.5, damage: 16, value: 300, color: 0x6d5412, eye: 0xffe08a,
    scale: 1.4, radius: 0.6, mass: 2,
    melee: { windup: 0.75, start: 2.8, hit: 3.4, cd: 2.4 },
    // DIRECTIONAL. The plate is the half of the body facing the player - a
    // borer closes head-first and the group faces the player throughout, so
    // the facing IS the plough's position. A hit carrying an impact POINT
    // is tested against the half it landed on; a direction-only hit against
    // whether it travelled against the facing. Directionless sources - a
    // burn, a poison tick, a blast - fall to armorDefault, and the
    // abdomen's answer is the honest one: the shell does not stop what
    // seeps.
    armor: (e, dirX, dirZ, point) => {
      const yaw = e.group.rotation.y;
      const fx = -Math.sin(yaw);
      const fz = -Math.cos(yaw);
      if (point) {
        const hx = point.x - e.pos.x;
        const hz = point.z - e.pos.z;
        const hl = Math.hypot(hx, hz) || 1;
        return (hx * fx + hz * fz) / hl > 0 ? BORER_PLATE : 1;
      }
      return dirX * fx + dirZ * fz < 0 ? BORER_PLATE : 1;
    },
    armorDefault: 1,
    onDeath: (e, ctx) => {
      // Only if the sac was swollen. The burst is the price of finishing a
      // borer quickly, and a player who did it slowly has already paid in
      // the other coin - time.
      if ((e.borSwell || 0) > BORER_BURST_SWELL) {
        ctx.addHazard(e.pos.x, e.pos.z, BORER_HONEY_R, BORER_HONEY_LIFE, HONEY_DPS, 'hiveblood');
        if (ctx.effects) {
          _hiveAt.set(e.pos.x, 0.9, e.pos.z);
          ctx.effects.burst(_hiveAt, 0xffd54f, 28, 5, 2.4, 0.8);
        }
      }
    },
    build: buildBorer, ai: aiBorer,
  },

  // The only artillery in the game whose landing produces a BODY rather than
  // ground: it lobs an egg that arcs in under a filling circle and hatches
  // into a grub - a weak rusher, grown on the spot over half a second and
  // shootable the whole way up. The answer is the carrion's answer, arrived
  // at from the other direction: kill it first, or fight what it keeps
  // making.
  oviger: {
    head: { r: 0.3, y: 0.58 },
    // `damage` here is not the oviger's - it never closes and never swings -
    // it is what a hatched grub bites for. The throw hands the grub this
    // number off its own wave-scaled stat block, which is the same contract
    // the Broodmother's brood keeps, so late-run grubs arrive as dangerous
    // as the wave they were laid in.
    hp: 46, speed: 1.9, damage: 10, value: 320, color: 0x7d611c, eye: 0xffe08a,
    scale: 1.15, radius: 0.55, mass: 1,
    orbit: { dist: 13, band: 2.5, out: 0.75, in: -0.55, strafe: 0.3, flip: 2.4, flipVar: 2 },
    build: buildOviger, ai: aiOviger,
  },

  // No attack. It hands out CARAPACE - a stacking, capped, permanent damage
  // reduction - and heals a slice with every stack, and the stack does NOT
  // die with the nurse. A conduit's buff lapses when the conduit does; this
  // one is bought with the same bullets that were clearing the room, so the
  // answer is to find the nurse before the stacks land, not after.
  nurse: {
    head: { r: 0.28, y: 0.8 },
    hp: 62, speed: 2.1, damage: 0, value: 340, color: 0xb08d2a, eye: 0xffe08a,
    scale: 1.15, radius: 0.5, mass: 1,
    orbit: { dist: 12, band: 2, out: 0.8, in: -0.6, strafe: 0.3, flip: 2, flipVar: 2 },
    build: buildNurse, ai: aiNurse,
  },

  // The high line. It holds a wide orbit, drifts down, and sweeps a slow
  // amber sightline across the floor for over a second before firing a
  // single fast lance along the arc - one long readable line from the sky,
  // answered by stepping off the arc it is drawing. The climb afterwards is
  // the window: the whole enemy is built to hand the player one.
  weeper: {
    head: { r: 0.28, y: 0.68 },
    hp: 54, speed: 3.4, damage: 12, value: 300, color: 0x9c7a2a, eye: 0xffe08a,
    scale: 1.1, radius: 0.5, mass: 1,
    fly: { height: WEEP_HIGH },
    hitbox: { r: 0.6, y: 0.55 },
    orbit: { dist: 17, band: 2.5, out: 0.8, in: -0.6, strafe: 0.3, flip: 2.4, flipVar: 2 },
    proj: {
      core: 0xfff3c4, glow: 0xffb300, scale: 0.85,
      speed: [26, 0.4, 34], dmg: [11, 0.45, 18],
    },
    build: buildWeeper, ai: aiWeeper,
  },

  // THE OVIGER'S EGG, OPENED - and the Broodmother's brood. Not a wave spawn:
  // nothing rolls one, exactly as nothing rolls a turret or a pylon. It is
  // thrown by an oviger or the boss, it lands under a filling circle, and it
  // fights as an ordinary rusher once it is up. Excluded from the boss add
  // budget with the other boss-owned bodies, so a brood never starves the
  // wave's own trickle.
  grub: {
    head: { r: 0.24, y: 0.48 },
    hp: 34, speed: 3.4, damage: 12, value: GRUB_VALUE, color: 0x8a6d1a, eye: 0xffe08a,
    scale: 0.85, radius: 0.4, mass: 1,
    statusMul: 0.5, fearMode: 'stagger', entropyExempt: true,
    melee: { windup: 0.4, start: 1.4, hit: 2.0, cd: 1.1 },
    build: buildGrub, ai: aiGrub, cleanup: releaseGrub,
  },

  // THE BROODMOTHER. Slow, nearly harmless in herself, and everything
  // dangerous in the room is something she made: the brood she refills, the
  // fan she throws off her own bulbs, the rings of honey she leaves where
  // she has stood. Under a quarter bar she eats the brood for speed - the
  // only enrage in the game that costs the boss something the player can
  // watch it pay.
  broodmother: {
    head: { r: 0.44, y: 1.12 },
    hp: 3400, speed: 2.2, damage: 26, value: 6000, color: 0x8a5e10, eye: 0xffd54f,
    scale: 2.9, radius: 1.8, mass: 8, boss: true,
    hitbox: { r: 0.72, y: 0.8 },
    statusMul: 0.3, freezeSlow: true, slowFactor: 0.75, freezeVuln: 1.0,
    entropyExempt: true, fearMode: 'stagger',
    melee: { windup: 0.7, start: 3.4, hit: 4.2, cd: 2.2 },
    // The fan, in the theme's own amber and one size up from the spitter's.
    proj: {
      core: 0xffe08a, glow: 0xffb300, scale: 0.85,
      speed: [14, 0.25, 20], dmg: [9, 0.4, 18],
    },
    build: buildBroodmother, ai: aiBroodmother,
  },
};

Object.assign(ENEMY_TYPES, TYPES);
