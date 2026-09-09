// EMBER's six enemies and its boss.
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
  ENEMY_TYPES, SHARED_MATS, _ashAt, _blinkAt, aiMelee, eyes, lump, orbit,
  partsFor, prism, rock, shard, slab, spike,
} from './shared.js';

// EMBER's other four. Every number that decides how much FLOOR one of them
// takes lives here, because that is the only currency this theme spends.
//
// THE LAVA CAP IS THE REAL CONSTRAINT and it is worth saying why these are as
// low as they are. Every patch any of them lays goes in the same capped list
// (HAZARD_KINDS in main.js), and an EMBER wave is the first wave in the game
// where FOUR different types are all laying into it at once. If each were tuned
// as though it had the list to itself, the oldest patches would be evicted
// continuously and every one of these mechanics would read as broken - a
// kiln's sweep with holes in it, an ashwing's line stopping halfway.
//
// So they are budgeted against each other rather than individually, and the
// magma's own drip was slowed to pay for it.
export const FLARE_CD = 3.4;

export const FLARE_RANGE = 22;

// Three patches in a fan, thrown clear of the impact point along the shell's
// own heading - so the ground it takes is the ground BEHIND whatever it was
// aimed at, and a player backing off in a straight line meets all three.
export const FLARE_BURST = 3;

export const FLARE_BURST_SPREAD = 0.5;   // radians between the fan's arms

export const FLARE_BURST_REACH = 2.0;    // metres from the impact point

// The kiln plants at this range and turns rather than closing further. Outside
// its own sweep, so walking up to one is always an option.
export const KILN_PLANT_RANGE = 13;

export const KILN_REACH = 7.5;

// A twentieth of a turn per half-beat: about eight seconds a revolution at
// 150bpm, slow enough to walk around and fast enough that standing still is
// never the answer.
export const KILN_STEP = (Math.PI * 2) / 20;

export const KILN_PATCH_RADIUS = 1.5;

export const KILN_PATCH_LIFE = 2.6;

export const KILN_PATCH_DPS = 12;

// How long a bellows keeps an enemy lit after it stops reaching it. Short, and
// refreshed every frame, so a bellows dying takes the fire off the wave
// immediately - which is the whole reason to shoot it.
export const BELLOWS_HOLD = 0.25;

export const BELLOWS_RANGE = 8;

export const BELLOWS_LINKS = 4;

export const ASHWING_HIGH = 4.6;

// The rear-up before a run. It cannot steer once committed, so this is the
// entire counterplay and it has to be long enough to read from underneath.
export const ASHWING_TELL = 0.9;

export const ASHWING_RUN_TIME = 2.2;

export const ASHWING_RUN_MUL = 2.4;

export const ASHWING_CD = 3.6;

// Where it turns in from: far enough out that the run crosses the whole arena
// rather than starting on top of the player.
export const ASHWING_STANDOFF = 17;

export const ASHWING_DROP_INTERVAL = 0.16;

export const ASHWING_PATCH_RADIUS = 1.35;

export const ASHWING_PATCH_LIFE = 3.4;

export const ASHWING_PATCH_DPS = 12;

// SLOWED, because magma is a brute now. At 0.42s a walker at speed 2.7 laid a
// connected line; at speed 1.8 the same interval lays two patches on the same
// square metre and spends the shared cap doing it.
export const MAGMA_DROP_INTERVAL = 0.75;

export const MAGMA_PATCH_RADIUS = 1.5;

export const MAGMA_PATCH_LIFE = 5;

export const MAGMA_PATCH_DPS = 12;

// The hex beam's two ends. Module-level and consumed immediately: the beam is
// redrawn every frame of a two-second channel and allocating there would
// litter the heap through the whole fight.
// EMBER's two: the far end of a kiln's bar and the point under an ashwing.
// Module level and reused - both run several times a second, per enemy.
export const _kilnTip = new THREE.Vector3();

export function buildMagma(e, g, s) {
  const P = partsFor(e, g, s);
  // STACKED UPWARD and off-axis. The chunks step sideways as they rise so the
  // tower leans and the joins are visible as notches in the outline - a
  // straight stack just rebuilt the lump this pass exists to get rid of.
  P('magmaBase', rock(0.4), { y: 0.34, sy: 0.75, sx: 1.15 });
  P('magmaMid', rock(0.34), { x: 0.1, y: 0.76, ry: 0.7, sy: 0.85 });
  P('magmaTop', rock(0.26), { x: -0.08, y: 1.14, ry: 1.5 });
  P('magmaHead', rock(0.17), { x: 0.06, y: 1.44, ry: 2.2 });
  // Jagged shards off the shoulders, angled out. These are what make the
  // outline read as broken rock rather than as a boulder.
  // One cached shard, varied by SCALE. geo() keys by name alone, so three
  // calls under one key asking for three different sizes would all silently
  // get whichever was built first.
  const shardGeo = spike(0.09, 0.46, 4);
  P('magmaShard', shardGeo, { x: -0.36, y: 1.0, rz: 0.85, rx: -0.2 });
  P('magmaShard', shardGeo, { x: 0.38, y: 0.84, rz: -1.05, rx: 0.3, s: 0.88 });
  P('magmaShard', shardGeo, { x: -0.2, y: 1.36, z: 0.24, rx: 0.7, s: 0.74 });
  P('magmaFoot', rock(0.15), { x: -0.28, y: 0.11, z: -0.04 });
  P('magmaFoot', rock(0.15), { x: 0.26, y: 0.11, z: 0.06 });
  // Vents sit in the notches between chunks: the only part of the model that
  // has to communicate anything, so they go where the rock does not meet.
  const ventGeo = shard(0.12);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    P('magmaVent', ventGeo, {
      x: Math.cos(a) * 0.3, y: 0.56 + i * 0.3, z: Math.sin(a) * 0.3,
      mat: SHARED_MATS.magmaVent, shadow: false,
    });
  }
  P('magmaCrust', spike(0.24, 0.36, 5), { x: 0.06, y: 1.7, mat: SHARED_MATS.magmaCrust });
  eyes(P, { y: 1.46, x: 0.09, z: -0.16, r: 0.85, mat: e.eyeMat });
}

// A four-sided obelisk with no legs, no arms and one slit instead of eyes.
// Read: it is not a soldier, it does not move like one, and it is the reason
// your shots stopped landing.
// ---- EMBER -----------------------------------------------------------------
// The theme's shape language, set by the magma above and carried by all four:
// cracked rock MASSES rather than limbs, glowing vent shards in the gaps
// between them, and dead black crust wherever the outline meets the sky. Where
// a type needs a machine part it is a FURNACE part - a drum, a port, a stack -
// never gunmetal, because the one thing an EMBER enemy must never read as is a
// RUST enemy that happens to be orange.

// Upright and lopsided: everything is the brazier. Read: it is standing off
// and it is going to throw that at you.
export function buildFlare(e, g, s) {
  const P = partsFor(e, g, s);
  // A narrow cracked column - two chunks with a notch between them, which is
  // where the vent goes. Flatter front to back than a magma so it reads as a
  // standing figure rather than as a pile.
  P('flareBody', rock(0.3), { y: 0.78, sy: 1.15, sz: 0.62 });
  P('flareChest', rock(0.24), { y: 1.24, ry: 0.8, sz: 0.66 });
  P('flareHead', spike(0.15, 0.34, 5), { y: 1.62, rx: 0.2 });
  // THE BRAZIER IS THE SILHOUETTE. An open bowl held well outboard and forward
  // on a cranked arm, so the outline is unbalanced from every bearing - the
  // same job the shooter's arm cannon does, in this theme's vocabulary.
  P('flareArm', slab(0.1, 0.1, 0.44), { x: 0.34, y: 1.12, z: -0.16, rx: 0.5 });
  P('flareBowl', prism(0.3, 0.13, 0.3, 6), { x: 0.4, y: 1.32, z: -0.34, rx: -0.35 });
  // The coal sitting in it, and the only part of the model that has to say
  // anything: this is where the shell comes from.
  P('flareCoal', shard(0.15), {
    x: 0.4, y: 1.38, z: -0.34, sy: 0.6, mat: SHARED_MATS.magmaVent, shadow: false,
  });
  // The other arm is a bare rod - what makes the brazier side read as heavy.
  P('flareArmThin', slab(0.07, 0.42, 0.07), { x: -0.28, y: 1.06, rz: 0.2 });
  P('flareVent', shard(0.11), {
    y: 1.02, z: -0.14, mat: SHARED_MATS.magmaVent, shadow: false,
  });
  P('flareLeg', slab(0.11, 0.52, 0.12), { x: -0.14, y: 0.27, rx: 0.1 });
  P('flareLeg', slab(0.11, 0.52, 0.12), { x: 0.14, y: 0.27, rx: -0.08 });
  P('flareCrust', spike(0.2, 0.26, 5), { y: 1.82, mat: SHARED_MATS.magmaCrust });
  eyes(P, { y: 1.62, x: 0.09, z: -0.14, r: 0.8, mat: e.eyeMat });
}

// A squat drum with a stack on it - wide at the floor, no legs worth the name.
// Read: it is going to plant itself here and the trouble is at ground level.
export function buildKiln(e, g, s) {
  const P = partsFor(e, g, s);
  // THE DRUM. Wide, low and six sided, so it is unmistakably a furnace lying
  // on the floor rather than a body standing on it. The whole silhouette is
  // bottom-heavy, which is the ground-denier read (blight, bomber).
  P('kilnDrum', prism(0.46, 0.54, 0.6, 6), { y: 0.36 });
  P('kilnBand', prism(0.5, 0.5, 0.1, 6), { y: 0.52, mat: SHARED_MATS.magmaCrust });
  // THE PORT the bar of flame comes out of - a horizontal slot on the front,
  // at the height the sweep actually runs at. It has to be findable, because
  // the answer to a kiln is to get behind it.
  P('kilnPort', slab(0.5, 0.14, 0.16), {
    y: 0.42, z: -0.44, mat: SHARED_MATS.magmaVent, shadow: false,
  });
  P('kilnLip', slab(0.58, 0.08, 0.1), { y: 0.56, z: -0.46, mat: SHARED_MATS.magmaCrust });
  // The stack. Tall and thin over a wide base - the one part that breaks the
  // top of the outline, and what stops it reading as a crate at distance.
  P('kilnStack', prism(0.13, 0.2, 0.72, 5), { x: 0.14, y: 1.02, rz: -0.12 });
  P('kilnCap', prism(0.19, 0.13, 0.14, 5), { x: 0.11, y: 1.42, mat: SHARED_MATS.magmaCrust });
  // Vents up the seam where the drum meets the stack.
  const ventGeo = shard(0.1);
  P('kilnVent', ventGeo, { x: -0.2, y: 0.78, mat: SHARED_MATS.magmaVent, shadow: false });
  P('kilnVent', ventGeo, { x: 0.3, y: 0.7, z: 0.16, mat: SHARED_MATS.magmaVent, shadow: false });
  // Stubby feet, splayed. It walks, but it should look like it would rather
  // not have to.
  P('kilnFoot', rock(0.16), { x: -0.34, y: 0.1, z: -0.1 });
  P('kilnFoot', rock(0.16), { x: 0.34, y: 0.1, z: -0.1 });
  P('kilnFoot', rock(0.16), { x: 0, y: 0.1, z: 0.32 });
  eyes(P, { y: 0.86, x: 0.11, z: -0.36, r: 0.75, mat: e.eyeMat });
}

// Floating, legless and symmetrical - the support read (conduit, warden) in
// EMBER's materials. Two lobes with a lit gap between them that opens and
// shuts, which is the entire animal: a pair of bellows breathing on the wave.
export function buildBellows(e, g, s) {
  const P = partsFor(e, g, s);
  // The two lobes. Held apart with a real gap, because the GAP is the thing -
  // a solid body here would just be a floating rock, and this has to read as
  // support (legless, symmetrical, air under it) from the flat black test.
  //
  // WIDE AND FLAT rather than round: the first pass used two 0.3 lumps a
  // shoulder's width apart and the silhouette closed up into one blob at
  // arena range. A lobe has to be broader than the gap is tall or the eye
  // fills the hole in.
  e.lobeA = P('bellowsLobe', rock(0.36), { y: 1.44, sy: 0.5, sx: 1.15 });
  e.lobeB = P('bellowsLobe', rock(0.36), { y: 0.7, sy: 0.5, sx: 1.15, ry: 0.9 });
  // The fire between them, and the only bright thing on the model. It scales
  // with the breath in aiBellows, so the enemy visibly PUMPS. Small on
  // purpose: at rest it must not bridge the two lobes, because the gap
  // closing is the animation and there is nowhere for it to go if it starts
  // shut.
  e.bellowsCore = P('bellowsCore', shard(0.16), {
    y: 1.07, mat: SHARED_MATS.magmaVent, shadow: false,
  });
  // TWO struts at the outer edges, not one bar down the middle. The first pass
  // ran a single spine through the centre at exactly the gap's height, which
  // filled in the one piece of negative space the whole design is built on -
  // the model was correct and the silhouette was a rock. Pushed out to the
  // flanks and back, they hinge the lobes together and leave the middle open.
  const strutGeo = slab(0.08, 0.78, 0.1);
  P('bellowsStrut', strutGeo, { x: -0.3, y: 1.07, z: 0.2, mat: SHARED_MATS.magmaCrust });
  P('bellowsStrut', strutGeo, { x: 0.3, y: 1.07, z: 0.2, mat: SHARED_MATS.magmaCrust });
  // Nozzles: short crusted pipes off the front and sides, which is where the
  // beams to the crowd are drawn from and what makes it read as feeding them.
  const nozGeo = prism(0.06, 0.1, 0.26, 5);
  P('bellowsNozzle', nozGeo, { x: -0.32, y: 1.05, z: -0.18, rz: 0.9, rx: -0.5 });
  P('bellowsNozzle', nozGeo, { x: 0.32, y: 1.05, z: -0.18, rz: -0.9, rx: -0.5 });
  P('bellowsNozzle', nozGeo, { y: 1.05, z: -0.38, rx: -1.3 });
  // No legs at all, and nothing below the lower lobe: the silhouette has to
  // have AIR under it or it stops reading as support.
  P('bellowsCrust', spike(0.22, 0.34, 5), { y: 1.78, mat: SHARED_MATS.magmaCrust });
  eyes(P, { y: 1.48, x: 0.11, z: -0.3, r: 0.85, mat: e.eyeMat });
}

// A flat swept delta, all width and no height. Read against the CEILING rather
// than the skyline, so unlike the ground roster its job is to be a distinct
// shape from below - which is why it is a wing with a lit trailing edge and
// nothing that could be mistaken for a body with legs.
export function buildAshwing(e, g, s) {
  const P = partsFor(e, g, s);
  // The wing: one flat plate, swept, with the leading edge crusted. Wide and
  // very thin, so from directly underneath it is a hard-edged triangle.
  P('ashwingWing', prism(0.12, 0.86, 0.16, 3), { y: 0.05, ry: Math.PI, sz: 1.5 });
  P('ashwingEdge', prism(0.1, 0.7, 0.09, 3), {
    y: 0.13, z: -0.12, ry: Math.PI, sz: 1.3, mat: SHARED_MATS.magmaCrust,
  });
  // A short cracked spine along the centre - the only mass on it, so the wing
  // reads as carrying something rather than as a loose sheet.
  P('ashwingCore', rock(0.2), { y: 0.16, z: 0.1, sy: 0.72, sz: 1.1 });
  // THE TRAILING VENTS. Three of them across the back edge, which is where the
  // fire comes off - so the part of the model the player sees last as it
  // passes over is the part that explains the line burning behind it.
  const ventGeo = shard(0.1);
  P('ashwingVent', ventGeo, { x: -0.4, y: 0.06, z: 0.5, mat: SHARED_MATS.magmaVent, shadow: false });
  P('ashwingVent', ventGeo, { x: 0, y: 0.06, z: 0.58, mat: SHARED_MATS.magmaVent, shadow: false });
  P('ashwingVent', ventGeo, { x: 0.4, y: 0.06, z: 0.5, mat: SHARED_MATS.magmaVent, shadow: false });
  // Wingtip fins, canted down. They break the flat triangle into something
  // with a top and a bottom, which is what tells the player whether it is
  // level or already rearing into a run.
  P('ashwingFin', spike(0.09, 0.34, 4), { x: -0.74, y: -0.02, rz: 1.9 });
  P('ashwingFin', spike(0.09, 0.34, 4), { x: 0.74, y: -0.02, rz: -1.9 });
  eyes(P, { y: 0.14, x: 0.1, z: -0.5, r: 0.8, mat: e.eyeMat });
}

// A chaser that has burnt through. Same forward lean and the same legs under
// it - it is a rusher and has to read as one - but stripped down to a cage of
// ribs with the fire showing between them. Read: there is not much left of it,
// and what is left is on fire.
export function buildCinder(e, g, s) {
  const P = partsFor(e, g, s);
  // The ember first, so the ribs are drawn over it and it shows THROUGH the
  // gaps rather than sitting on top of the chest.
  P('cinderCore', lump(0.2), { y: 0.94, z: -0.04, mat: SHARED_MATS.cinderEmber, shadow: false });
  // A cage, not a torso: four thin bars round the core, leaning with the body.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    P('cinderRib', slab(0.06, 0.52, 0.06), {
      x: Math.cos(a) * 0.21, y: 0.94, z: Math.sin(a) * 0.17 - 0.04,
      rx: -0.3, rz: -Math.cos(a) * 0.24,
    });
  }
  P('cinderYoke', prism(0.22, 0.24, 0.12, 5), { y: 1.24, z: -0.12, rx: -0.3 });
  P('cinderPelvis', prism(0.18, 0.14, 0.14, 5), { y: 0.62, z: 0.04 });
  // Skull, small and thrust forward on a bare neck.
  P('cinderNeck', prism(0.06, 0.07, 0.14, 4), { y: 1.34, z: -0.2, rx: -0.6 });
  P('cinderSkull', shard(0.14), { y: 1.44, z: -0.32, sz: 1.3 });
  // THE CREST. Three tongues swept back off the skull, thin and rising - the
  // only part that is not straight, and what makes the outline read as flame
  // rather than as one more spined rusher.
  for (const [x, ln, tilt] of [[-0.12, 0.4, 1.0], [0, 0.54, 0.75], [0.12, 0.4, 1.0]]) {
    P('cinderTongue', spike(0.045, ln, 4), { x, y: 1.5, z: 0.06, rx: tilt });
  }
  P('cinderThigh', slab(0.09, 0.42, 0.11), { x: -0.14, y: 0.5, z: 0.08, rx: 0.35 });
  P('cinderThigh', slab(0.09, 0.42, 0.11), { x: 0.14, y: 0.5, z: 0.08, rx: 0.35 });
  P('cinderShin', slab(0.07, 0.4, 0.09), { x: -0.14, y: 0.19, z: -0.02, rx: -0.22 });
  P('cinderShin', slab(0.07, 0.4, 0.09), { x: 0.14, y: 0.19, z: -0.02, rx: -0.22 });
  eyes(P, { y: 1.46, x: 0.08, z: -0.42, r: 0.8, mat: e.eyeMat });
}

// Legless: a wide braced platform with a barrel angled at the sky. Read: it is
// not chasing you, it is ranging on you.
// EMBER's boss: a furnace that walks. The theme's own language at boss scale -
// stacked rock masses, crusted caps, vents in the gaps - with the one thing no
// ordinary EMBER enemy has, a chest that OPENS. Read: it is a building, and
// there is a fire inside it.
export function buildForge(e, g, s) {
  const P = partsFor(e, g, s);
  // A wide planted base. Everything about the lower half says it will not be
  // moved; everything about the upper half says there is pressure in it.
  P('forgeBase', prism(0.62, 0.8, 0.5, 6), { y: 0.28 });
  P('forgeHaunch', rock(0.5), { x: -0.42, y: 0.5, sy: 0.8 });
  P('forgeHaunch2', rock(0.5), { x: 0.42, y: 0.5, sy: 0.8, ry: 1.1 });
  // The body: a drum, banded, with the chest cavity cut into the front of it.
  P('forgeDrum', prism(0.62, 0.66, 0.86, 6), { y: 1.12 });
  P('forgeBand', prism(0.7, 0.7, 0.1, 6), { y: 1.42, mat: SHARED_MATS.magmaCrust });

  // THE CHEST, and the whole fight. Two crusted doors that draw apart when it
  // vents, with the furnace behind them. Held on the enemy so aiForge can
  // slide them - the same trick Colossus's shutters use, and the same reason:
  // the player has to be able to SEE the window, not infer it from the
  // damage numbers.
  //
  // DEPTH MATTERS HERE MORE THAN ANYWHERE ELSE ON THE MODEL. The first pass
  // put a 0.42 core at z -0.3 behind doors at z -0.46, and an octahedron that
  // size reaches further forward than the doors did - so the furnace poked out
  // THROUGH its own shutters and the chest read as a dark dent whether it was
  // open or shut. The core is smaller and set back into the drum now, and the
  // doors sit proud of its front face, so the only way to see the fire is for
  // them to actually move.
  e.forgeCore = P('forgeCore', shard(0.3), {
    y: 1.16, z: -0.34, mat: SHARED_MATS.magmaVent, shadow: false,
  });
  const doorGeo = slab(0.36, 0.76, 0.14);
  e.doorL = P('forgeDoor', doorGeo, { x: -0.19, y: 1.16, z: -0.64, mat: SHARED_MATS.magmaCrust });
  e.doorR = P('forgeDoor', doorGeo, { x: 0.19, y: 1.16, z: -0.64, mat: SHARED_MATS.magmaCrust });

  // FOUR STACKS off the shoulders, swept back and uneven. They are what makes
  // the silhouette unmistakable at range and from behind - a boss the player
  // has to be able to find in a room its own adds are filling.
  const stackGeo = prism(0.12, 0.2, 0.9, 5);
  P('forgeStack', stackGeo, { x: -0.5, y: 1.95, z: 0.22, rx: 0.28, rz: 0.2 });
  P('forgeStack', stackGeo, { x: 0.5, y: 1.95, z: 0.22, rx: 0.28, rz: -0.2, s: 0.88 });
  P('forgeStack', stackGeo, { x: -0.22, y: 2.05, z: 0.36, rx: 0.4, s: 0.76 });
  P('forgeStack', stackGeo, { x: 0.26, y: 2.0, z: 0.36, rx: 0.4, s: 0.68 });
  // Vent shards in every seam. On the shared magma material, so a Forge and a
  // magma glow with the same fire.
  const ventGeo = shard(0.16);
  P('forgeVent', ventGeo, { x: -0.6, y: 1.2, mat: SHARED_MATS.magmaVent, shadow: false });
  P('forgeVent', ventGeo, { x: 0.6, y: 1.2, mat: SHARED_MATS.magmaVent, shadow: false });
  P('forgeVent', ventGeo, { y: 1.5, z: 0.5, mat: SHARED_MATS.magmaVent, shadow: false });

  // A low head sunk between the shoulders - it is a furnace first and a
  // creature second, so the head must not be the thing you read.
  P('forgeHead', rock(0.26), { y: 1.72, z: -0.24, sy: 0.8 });
  P('forgeBrow', spike(0.24, 0.3, 5), { y: 1.94, z: -0.2, rx: -0.5, mat: SHARED_MATS.magmaCrust });
  // Arms: heavy, long, and ending in blunt masses. It swings these.
  P('forgeArm', slab(0.24, 0.8, 0.24), { x: -0.74, y: 1.1, rz: 0.24 });
  P('forgeArm', slab(0.24, 0.8, 0.24), { x: 0.74, y: 1.1, rz: -0.24 });
  P('forgeFist', rock(0.3), { x: -0.86, y: 0.62 });
  P('forgeFist', rock(0.3), { x: 0.86, y: 0.62 });
  P('forgeFoot', rock(0.3), { x: -0.34, y: 0.14, z: -0.12 });
  P('forgeFoot', rock(0.3), { x: 0.34, y: 0.14, z: -0.12 });
  eyes(P, { y: 1.76, x: 0.14, z: -0.42, r: 1.5, mat: e.eyeMat });
}

// Walks the player down and burns the floor as it goes. The patch is dropped
// where it HAS been, never where it is going: a trail the player can be
// steered into is area denial, one that appears under their feet is an
// unavoidable hit.
export function aiMagma(e, a) {
  aiMelee(e, a);
  e.magmaCd = (e.magmaCd || 0) - a.dt;
  if (e.magmaCd > 0) return;
  e.magmaCd = MAGMA_DROP_INTERVAL;
  a.ctx.addHazard(
    e.pos.x, e.pos.z,
    MAGMA_PATCH_RADIUS, MAGMA_PATCH_LIFE, MAGMA_PATCH_DPS, 'lava'
  );
  if (a.ctx.effects) {
    _blinkAt.set(e.pos.x, 0.25, e.pos.z);
    a.ctx.effects.burst(_blinkAt, 0xff7a18, 5, 1.6, 2, 0.5);
  }
}

// Walks the player down and freezes the floor as it goes. Structurally the
// magma's trail and deliberately so - same drop-behind-me rule, for the same
// reason: ground the player can be STEERED onto is area denial, ground that
// appears under their feet is an unavoidable hit.
//
// What is different is that this trail costs nothing to stand in. It is not
// trying to hurt the player; it is trying to keep them where the rest of the
// wave can.
// ---- EMBER -----------------------------------------------------------------

// Orbits and lobs. The shell is a Spit like the blight's and the vitriol's -
// same arc, same lead, same tell - and what is different is only what grows
// where it lands: a FAN of three rather than one patch, thrown along the
// shell's own heading.
export function aiFlare(e, a) {
  orbit(e, a, ENEMY_TYPES.flare.orbit);
  if (e.attackCd > 0 || a.dist > FLARE_RANGE) return;
  e.attackCd = FLARE_CD + Math.random() * 0.8;
  e.flash = 0.15;
  a.ctx.addSpit(e.pos.x + a.nx * 0.8, 1.2, e.pos.z + a.nz * 0.8, 'ember');
  if (a.ctx.effects) {
    _blinkAt.set(e.pos.x + a.nx * 0.5, 1.4, e.pos.z + a.nz * 0.5);
    a.ctx.effects.burst(_blinkAt, ENEMY_TYPES.flare.color, 12, 3.4, 2, 0.5);
  }
}

// Walks to its range, plants, and turns. THE SWEEP IS ON THE BEAT: the bearing
// steps once per Music.pulse, never on a clock of its own - see the note on
// the type. Everything else here is bookkeeping around that one edge test.
export function aiKiln(e, a) {
  // Close to its planting range and then stop. It does not orbit and it does
  // not retreat: a kiln backing away from the player would be dragging its own
  // sweep around after them, and the point of the enemy is that the wedge of
  // burning floor stays where it was put and the player has to leave.
  if (a.dist > KILN_PLANT_RANGE) {
    a.vx = a.px * e._effSpeed();
    a.vz = a.pz * e._effSpeed();
    e._setEyeAlert(false);
    return;
  }
  e._setEyeAlert(true);

  if (e.kilnAngle === undefined) {
    // Started on its own bearing and its own direction of travel, so two kilns
    // in one wave carve different wedges instead of one thick one.
    e.kilnAngle = Math.random() * Math.PI * 2;
    e.kilnDir = Math.random() < 0.5 ? -1 : 1;
    e._lastKilnPulse = a.ctx.pulse;
  }

  // THE EDGE TEST IS INEQUALITY, not order. music.js's pulse is a counter that
  // only climbs, but a loop or a seek can move the grid position backwards
  // while the index does not - so comparing for difference is what cannot miss
  // a beat in a long frame or fire twice in a short one.
  if (a.ctx.pulse !== e._lastKilnPulse) {
    e._lastKilnPulse = a.ctx.pulse;
    e.kilnAngle += KILN_STEP * e.kilnDir;
    const bx = e.pos.x + Math.cos(e.kilnAngle) * KILN_REACH;
    const bz = e.pos.z + Math.sin(e.kilnAngle) * KILN_REACH;
    a.ctx.addHazard(bx, bz, KILN_PATCH_RADIUS, KILN_PATCH_LIFE, KILN_PATCH_DPS, 'ember');
    if (a.ctx.effects) {
      _kilnTip.set(bx, 0.3, bz);
      // The bar itself, drawn every step from the port to the tip. This is the
      // warning - the patch it lays is where the bar ALREADY was.
      a.ctx.effects.beam(e.pos, _kilnTip, 0xff6a1f);
      a.ctx.effects.burst(_kilnTip, 0xffb347, 4, 2, 2, 0.4);
    }
  }
  // Faces along the bar, so the port on the model is pointing at the fire.
  e.group.rotation.y = -e.kilnAngle + Math.PI / 2;
  e.faceLocked = true;
}

// No attack. It stands off and LIGHTS the wave: every EMBER enemy inside its
// range burns on contact for as long as this thing is alive.
//
// Written as a refreshed flag on the target rather than as a list held here,
// exactly like the conduit's buff - so it lapses a fraction of a second after
// the bellows stops reaching, and dies with it, with nothing to clean up.
export function aiBellows(e, a) {
  orbit(e, a, ENEMY_TYPES.bellows.orbit);

  // The breath, and the whole animation budget of the enemy: the core between
  // the lobes swells and the lobes part with it. On its own clock rather than
  // the beat, because it is a body doing a body thing - the KILN is the one
  // that belongs to the track.
  const breath = 0.5 + 0.5 * Math.sin(a.ctx.time * 3.4 + e.id);
  if (e.bellowsCore) e.bellowsCore.scale.setScalar((0.7 + breath * 0.6) * e.scale);
  if (e.lobeA && e.lobeB) {
    e.lobeA.position.y = (1.44 + breath * 0.08) * e.scale;
    e.lobeB.position.y = (0.7 - breath * 0.08) * e.scale;
  }

  let drawn = 0;
  for (const o of a.ctx.enemies) {
    // Bosses excluded for the conduit's reason: an unreadable buff on the one
    // fight the player is already reading closely.
    if (o === e || o.dead || o.boss || o.type === 'bellows') continue;
    const dx = o.pos.x - e.pos.x;
    const dz = o.pos.z - e.pos.z;
    if (dx * dx + dz * dz > BELLOWS_RANGE * BELLOWS_RANGE) continue;
    o.igniteT = BELLOWS_HOLD;
    if (drawn++ < BELLOWS_LINKS && a.ctx.effects) {
      a.ctx.effects.beam(e.pos, o.pos, 0xff6a1f);
    }
  }
}

// Circles wide, rears, then flies a straight line across the arena laying
// fire, and cannot steer while it does. Four states on e.aw:
//
//   'circle'  hold ASHWING_STANDOFF from the player, waiting out the cooldown
//   'tell'    rear up on the spot, aimed at where the player is NOW
//   'run'     commit: fixed heading, no steering, dropping the whole way
//   'bank'    climb away and go back to circling
//
// The heading is frozen at the END of the tell, which is what makes the tell
// mean something: the line it draws is the line the player was standing on
// when it reared, not the one they are on when it arrives.
export function aiAshwing(e, a) {
  if (!e.aw) e.aw = { state: 'circle', t: 0, hx: 0, hz: 1, drop: 0 };
  const aw = e.aw;
  aw.t -= a.dt;

  if (aw.state === 'run') {
    e.hoverY = ASHWING_HIGH * 0.72;
  // RAISING THE VELOCITY IS NOT ENOUGH. Enemy.update clamps how far a body may
  // move in a frame to `speed * stepMul`, and stepMul defaults to 1.4 - so an
  // ai() that multiplies its own velocity by three and does not touch it moves
  // at 1.4x and looks like a slightly hurried walk. Every committed charge in
  // the game raises it (the shrike's dive, Colossus's and Siege's) and all
  // three of the ones added with the themes had silently not been.
    e.stepMul = ASHWING_RUN_MUL;
    // NO STEERING. vx/vz come off the frozen heading, not off nx/nz.
    const sp = e._effSpeed() * ASHWING_RUN_MUL;
    a.vx = aw.hx * sp;
    a.vz = aw.hz * sp;
    e.group.rotation.y = Math.atan2(aw.hx, aw.hz) + Math.PI;
    e.faceLocked = true;

    aw.drop -= a.dt;
    if (aw.drop <= 0) {
      aw.drop = ASHWING_DROP_INTERVAL;
      a.ctx.addHazard(
        e.pos.x, e.pos.z,
        ASHWING_PATCH_RADIUS, ASHWING_PATCH_LIFE, ASHWING_PATCH_DPS, 'ember'
      );
      if (a.ctx.effects) {
        _ashAt.set(e.pos.x, e.pos.y - 0.3, e.pos.z);
        a.ctx.effects.burst(_ashAt, 0xff7a18, 4, 2.2, 2, 0.45);
      }
    }
    // Ends on the clock or on the far wall, whichever comes first - a run that
    // kept going would grind along the boundary laying a stripe down it.
    if (aw.t <= 0 || Math.abs(e.pos.x) > 20 || Math.abs(e.pos.z) > 20) {
      aw.state = 'bank';
      aw.t = ASHWING_CD * e.rate;
      e._setEyeAlert(false);
    }
    return;
  }

  e.stepMul = 1.4;
  if (aw.state === 'tell') {
    e.hoverY = ASHWING_HIGH + 0.9;
    // Rears: nose up and rolled, held on the spot. The one second of the whole
    // cycle where it is stationary and directly readable from below.
    e.group.rotation.x = -0.7;
    e.faceLocked = false;
    a.vx = 0;
    a.vz = 0;
    if (aw.t <= 0) {
      // FREEZE THE HEADING HERE, aimed through the player rather than at them,
      // so the line runs past and keeps going.
      aw.hx = a.nx;
      aw.hz = a.nz;
      aw.state = 'run';
      aw.t = ASHWING_RUN_TIME;
      aw.drop = 0;
      e.group.rotation.x = 0;
    }
    return;
  }

  if (aw.state === 'bank') {
    // Climb out wide. Deliberately slow and high - this is the window, the
    // same way the shrike's climb is.
    e.hoverY = ASHWING_HIGH + 1.4;
    a.vx = -a.nx * e._effSpeed() * 0.8;
    a.vz = -a.nz * e._effSpeed() * 0.8;
    if (aw.t <= 0) aw.state = 'circle';
    return;
  }

  // 'circle': hold the standoff and wait. It is out of reach and doing nothing
  // here, which is the rhythm - a bombing run is a thing that arrives, not a
  // thing that is always happening.
  e.hoverY = ASHWING_HIGH;
  const push = a.dist < ASHWING_STANDOFF ? -0.9 : 0.7;
  const sp = e._effSpeed();
  a.vx = (a.nx * push - a.nz * 0.55) * sp;
  a.vz = (a.nz * push + a.nx * 0.55) * sp;
  if (aw.t <= 0 && a.dist < ASHWING_STANDOFF + 6) {
    aw.state = 'tell';
    aw.t = ASHWING_TELL;
    e._setEyeAlert(true);
  }
}

// ---- VERDANT ---------------------------------------------------------------

// ---- the Forge-Tyrant -------------------------------------------------------
// How fast the bar fills, and what each third of it buys. Tuned so a player
// doing reasonable damage sees three or four vents in a fight: fewer and the
// windows are too scarce to build a fight around, more and the escalation
// never gets far enough up the ladder to show the ring.
export const FORGE_HEAT_RATE = 1 / 15;

export const FORGE_SWEEP_AT = 0.34;

export const FORGE_RING_AT = 0.67;

// The vent. LONG, because it is the whole reward, and it has to be worth
// having spent the fight earning.
export const FORGE_VENT_TIME = 4.2;

export const FORGE_VENT_R0 = 3.5;

export const FORGE_VENT_R1 = 11;

export const FORGE_VENT_DROP = 0.22;

// The sweep: the kiln's bar, at boss scale and twice the reach.
export const FORGE_SWEEP_TIME = 3.4;

export const FORGE_SWEEP_REACH = 13;

export const FORGE_SWEEP_STEP = (Math.PI * 2) / 26;

// The ring: a wall of fire at a fixed radius with ONE gap in it. The gap is
// the entire counterplay, so it is wide enough to find under pressure and
// narrow enough that finding it is a decision.
export const FORGE_RING_R = 9;

export const FORGE_RING_N = 18;

export const FORGE_RING_GAP = 3;      // consecutive slots left open

export const FORGE_SPECIAL_CD = 6.5;

export const FORGE_PATCH_RADIUS = 1.8;

export const FORGE_PATCH_LIFE = 3.2;

export const FORGE_PATCH_DPS = 14;

export const _forgeAt = new THREE.Vector3();

// Slides the chest doors and brightens the furnace behind them. Everything the
// player needs to know about this fight is on this one part of the model, so
// it is driven every frame rather than on the state transitions - a window
// that snapped open would be a window they could miss the start of.
export function _forgeDoors(e, open, dt) {
  const bs = e.bs;
  bs.doorT += ((open ? 1 : 0) - bs.doorT) * Math.min(1, dt * 6);
  if (e.doorL) {
    e.doorL.position.x = (-0.19 - bs.doorT * 0.38) * e.scale;
    e.doorR.position.x = (0.19 + bs.doorT * 0.38) * e.scale;
  }
  if (e.forgeCore) {
    // Swells with the heat even while shut, so the bar filling is legible on
    // the BODY and not only on the HUD.
    const k = 0.7 + bs.heat * 0.5 + bs.doorT * 0.9;
    e.forgeCore.scale.setScalar(k * e.scale);
  }
}

export function aiForge(e, a) {
  const bs = e.bs;
  const ctx = a.ctx;
  if (bs.state === undefined) {
    bs.state = 'walk';
    bs.heat = 0;
    bs.t = 0;
    bs.cd = FORGE_SPECIAL_CD * 0.5;
    bs.doorT = 0;
    bs.angle = Math.random() * Math.PI * 2;
    bs.dir = Math.random() < 0.5 ? -1 : 1;
    bs.lastPulse = ctx.pulse;
    bs.venting = false;
    // Read by main.js's 'vent' bossEvent for the HUD note. Colossus says CORE
    // EXPOSED because a shutter opened on a clock; this one is the boss
    // choosing to stop, which is a different thing and should say so.
    bs.ventNote = 'VENTING';
  }
  bs.t -= a.dt;

  // ---- venting ------------------------------------------------------------
  // Stationary, plates open, full damage - and radiating. The player wants to
  // be inside the ring's growth for as long as they dare and out of it before
  // it reaches them, which is the one decision this fight is built to ask.
  if (bs.state === 'vent') {
    a.vx = 0;
    a.vz = 0;
    _forgeDoors(e, true, a.dt);
    const k = 1 - Math.max(0, bs.t) / FORGE_VENT_TIME;
    const r = FORGE_VENT_R0 + (FORGE_VENT_R1 - FORGE_VENT_R0) * k;
    bs.drop -= a.dt;
    if (bs.drop <= 0) {
      bs.drop = FORGE_VENT_DROP;
      // Laid as a RING at the current radius rather than as a disc, so the
      // ground it has already crossed cools and the player can follow it back
      // in. A disc would simply delete the arena for four seconds.
      const n = 10;
      const off = Math.random() * Math.PI * 2;
      for (let i = 0; i < n; i++) {
        const ang = off + (i / n) * Math.PI * 2;
        ctx.addHazard(
          e.pos.x + Math.cos(ang) * r, e.pos.z + Math.sin(ang) * r,
          FORGE_PATCH_RADIUS, FORGE_PATCH_LIFE, FORGE_PATCH_DPS, 'ember'
        );
      }
      if (ctx.effects) {
        _forgeAt.set(e.pos.x, 1.4, e.pos.z);
        ctx.effects.burst(_forgeAt, 0xff8c1a, 16, 5, 2, 0.6);
      }
    }
    if (bs.t <= 0) {
      bs.state = 'walk';
      bs.venting = false;
      bs.heat = 0;
      bs.cd = FORGE_SPECIAL_CD;
      e.weakOpen = false;
      ctx.bossEvent('vent', e);
    }
    return;
  }

  // Heat only climbs while it is FIGHTING. A player who runs away is not
  // making progress toward a window, which is what stops the vent from being
  // something you can farm by kiting.
  bs.heat = Math.min(1, bs.heat + a.dt * FORGE_HEAT_RATE * (a.dist < 26 ? 1 : 0.25));
  _forgeDoors(e, false, a.dt);

  if (bs.heat >= 1) {
    bs.state = 'vent';
    bs.venting = true;
    bs.t = FORGE_VENT_TIME;
    bs.drop = 0;
    // `weakOpen` is the field main.js's 'vent' event reads, so reusing it
    // means the HUD note and the bar's colour come for free.
    e.weakOpen = true;
    bs.weakOpen = true;
    ctx.bossEvent('vent', e);
    return;
  }
  bs.weakOpen = false;

  // ---- the sweep ----------------------------------------------------------
  if (bs.state === 'sweep') {
    a.vx = 0;
    a.vz = 0;
    // ON THE BEAT, exactly as the kiln's is. The boss and its own artillery
    // turning at the same rate is most of what makes an EMBER boss wave read
    // as one fight rather than as a boss with unrelated adds.
    if (ctx.pulse !== bs.lastPulse) {
      bs.lastPulse = ctx.pulse;
      bs.angle += FORGE_SWEEP_STEP * bs.dir;
      const bx = e.pos.x + Math.cos(bs.angle) * FORGE_SWEEP_REACH;
      const bz = e.pos.z + Math.sin(bs.angle) * FORGE_SWEEP_REACH;
      // Two patches along the bar, not one at the tip: at thirteen metres a
      // single patch out at the end leaves a corridor of safe ground between
      // the boss and the fire, which is exactly where a player would stand.
      for (const f of [0.55, 1]) {
        ctx.addHazard(
          e.pos.x + Math.cos(bs.angle) * FORGE_SWEEP_REACH * f,
          e.pos.z + Math.sin(bs.angle) * FORGE_SWEEP_REACH * f,
          FORGE_PATCH_RADIUS, FORGE_PATCH_LIFE, FORGE_PATCH_DPS, 'ember'
        );
      }
      if (ctx.effects) {
        _forgeAt.set(bx, 0.4, bz);
        ctx.effects.beam(e.pos, _forgeAt, 0xff6a1f);
        ctx.effects.burst(_forgeAt, 0xffb347, 5, 2.5, 2, 0.4);
      }
    }
    e.group.rotation.y = -bs.angle + Math.PI / 2;
    e.faceLocked = true;
    if (bs.t <= 0) {
      bs.state = 'walk';
      bs.cd = FORGE_SPECIAL_CD * e.rate;
    }
    return;
  }

  // ---- the ring -----------------------------------------------------------
  // One slam, one wall of fire at a fixed radius, one gap in it. Unlike the
  // sweep there is nothing to outrun - the answer is to be looking for the gap
  // before it lands, which is why the whole thing is laid in a single frame
  // and telegraphed by the slam that precedes it.
  if (bs.state === 'ring') {
    a.vx = 0;
    a.vz = 0;
    if (bs.t <= 0) {
      const gapAt = (Math.random() * FORGE_RING_N) | 0;
      for (let i = 0; i < FORGE_RING_N; i++) {
        // The gap is CONSECUTIVE slots, so it is an arc the player can aim at
        // rather than a scatter of holes they have to be lucky to find.
        const inGap = ((i - gapAt + FORGE_RING_N) % FORGE_RING_N) < FORGE_RING_GAP;
        if (inGap) continue;
        const ang = (i / FORGE_RING_N) * Math.PI * 2;
        ctx.addHazard(
          e.pos.x + Math.cos(ang) * FORGE_RING_R, e.pos.z + Math.sin(ang) * FORGE_RING_R,
          FORGE_PATCH_RADIUS, FORGE_PATCH_LIFE * 1.4, FORGE_PATCH_DPS, 'ember'
        );
      }
      if (ctx.effects) {
        _forgeAt.set(e.pos.x, 0.6, e.pos.z);
        ctx.effects.shockwave(_forgeAt, 0xff5a1f, FORGE_RING_R, 0.45);
        ctx.effects.burst(_forgeAt, 0xff8c1a, 24, 6, 2, 0.7);
      }
      if (ctx.sfx) ctx.sfx.impact();
      bs.state = 'walk';
      bs.cd = FORGE_SPECIAL_CD * e.rate;
    }
    return;
  }

  // ---- walking, and picking the next special ------------------------------
  aiMelee(e, a);
  bs.cd -= a.dt;
  if (bs.cd > 0 || a.dist > 26) return;

  // Escalating: what it is allowed to reach for is a function of how hot it
  // is, so the fight visibly climbs toward the vent instead of arriving there.
  const canRing = bs.heat >= FORGE_RING_AT;
  const canSweep = bs.heat >= FORGE_SWEEP_AT;
  if (canRing && (Math.random() < 0.5 || !canSweep)) {
    bs.state = 'ring';
    // The wind-up IS the telegraph, and the only warning the ring gets.
    bs.t = 0.85;
    e.flash = 0.2;
    ctx.bossEvent('charge', e);
  } else if (canSweep) {
    bs.state = 'sweep';
    bs.t = FORGE_SWEEP_TIME;
    bs.dir = Math.random() < 0.5 ? -1 : 1;
  }
}

const TYPES = {
  // Punishes running the same line the enemy is running. It walks toward the
  // player like a chaser and burns the floor behind it, so the ground it has
  // crossed stays dangerous for five seconds. Slower and weaker in melee than
  // a chaser, because the trail is where its threat actually lives - and the
  // trail is the reason to break off and take an angle rather than backpedal
  // in a straight line.
  //
  // IT IS A BRUTE NOW, not a rusher. As EMBER's heavy it does the job the trail
  // was always better at than the chase: a brute is the thing you circle while
  // you deal with the wave around it, and this is the one that charges you for
  // circling, because the circle is on fire by the second lap. As a rusher it
  // was the reverse - it walked at you laying ground you were already leaving,
  // and the trail only ever caught a player who backed up in a straight line.
  //
  // Priced into the brute band accordingly: a tank's shape, a husk's mass, and
  // damage in the LOWER half of the band, because the fire it leaves is the
  // rest of the payment (see the afflictor rule further down).
  magma: {
    hp: 150, speed: 1.8, damage: 16, value: 300, color: 0xff5a1f, eye: 0xffd166,
    scale: 1.35, radius: 0.58, mass: 2,
    melee: { windup: 0.75, start: 2.8, hit: 3.5, cd: 2.3 },
    build: buildMagma, ai: aiMagma,
  },

  // ---- the rest of EMBER -------------------------------------------------
  //
  // Four types built around one idea the theme owns outright: HEAT THAT IS
  // STILL THERE AFTER THE THING THAT MADE IT HAS MOVED ON. Every one of them
  // puts fire on the FLOOR rather than on the player, and none of them does
  // much of anything on contact - a cinder's touch is five points, a kiln and
  // a bellows deal literally nothing, an ashwing has no attack at all.
  //
  // What that buys is a theme whose question is always the same one and never
  // has the same answer twice: WHERE IS THERE LEFT TO STAND. A magma takes the
  // ground you circle on, a flare takes the ground behind you, a kiln takes a
  // rotating wedge of it and an ashwing draws a line straight through the
  // middle. None of them is dangerous on its own. Together they are a room
  // that keeps getting smaller.
  //
  // THEY SHARE A SILHOUETTE LANGUAGE. Cracked rock masses with glowing vents
  // in the gaps between them, capped in dead black crust - established by the
  // magma above and carried by all four, so an EMBER wave reads as one family
  // of things even in the flat black test.

  // Punishes holding a lane. It lobs a bursting shell rather than shooting:
  // where it lands, three patches of fire open in a fan pointing AWAY from the
  // flare, so the ground it takes is the ground behind whatever it was aiming
  // at. A player who backpedals in a straight line walks into all three; a
  // player who steps sideways walks past the fan's edge.
  //
  // The shell is slow and lit and arcs high, so it is a thing to be read and
  // moved off rather than dodged on reflex - and the answer is always to move
  // ACROSS it, which is the habit this whole theme is trying to build.
  flare: {
    hp: 30, speed: 2.4, damage: 9, value: 220, color: 0xff7a18, eye: 0xffd166,
    scale: 1.05, radius: 0.48, mass: 1,
    orbit: { dist: 11, band: 2, out: 0.7, in: -0.5, strafe: 0.4, flip: 2.2, flipVar: 2 },
    proj: { core: 0xffd08a, glow: 0xff5a1f, scale: 1.2 },
    build: buildFlare, ai: aiFlare,
  },

  // The theme's clock. It plants itself and sweeps a bar of flame around the
  // floor like a lighthouse, one step per HALF BEAT - so the arena has a
  // rotating wedge of ground you cannot be on, and the rate it turns at is the
  // track. It is the one enemy in the game you can hear coming.
  //
  // On Music.pulse rather than a timer of its own, for the reason upgrades.js
  // states outright: nothing rhythmic in this game runs on a private clock. A
  // sweep on a 0.4s interval next to a soundtrack at 144bpm would beat against
  // it and read as broken rather than as fast.
  //
  // No damage of its own, exactly like the blight and the vitriol it stands
  // beside in the artillery role. What it throws IS the enemy.
  kiln: {
    hp: 46, speed: 1.8, damage: 0, value: 290, color: 0xd2691e, eye: 0xffb347,
    scale: 1.15, radius: 0.56, mass: 2,
    build: buildKiln, ai: aiKiln,
  },

  // Turns the wave into cinders. No attack at all: while it lives, every EMBER
  // enemy near it burns you on contact as well as hitting you.
  //
  // THIS IS THE ONE PLACE THE AFFLICTOR RULE IS DELIBERATELY BROKEN, and the
  // support role is where it is allowed to be. The rule says a type that
  // leaves a status hits for less, because the status is the payment - but a
  // bellows is not the thing hitting you. It is a high-value target standing
  // behind the crowd doing no damage whatsoever, and killing it is the
  // payment, exactly as it is for the conduit's free 30% resist. What it costs
  // is having to turn away from what is in front of you.
  //
  // Short burn on purpose. It has to be a reason to shoot the bellows, not a
  // reason to stop playing the wave.
  bellows: {
    hp: 62, speed: 2.1, damage: 0, value: 340, color: 0xe2683a, eye: 0xffd166,
    scale: 1.15, radius: 0.5, mass: 1,
    orbit: { dist: 9, band: 2, out: 0.7, in: -0.6, strafe: 0.35, flip: 2.4, flipVar: 2 },
    build: buildBellows, ai: aiBellows,
  },

  // The bombing run. It has NO attack - it flies straight lines across the
  // arena through wherever the player was standing when it committed, and lays
  // fire the whole way, then banks out wide and comes back on a new bearing.
  //
  // Written as a RUN rather than as a hover for two reasons. It keeps it away
  // from RIME's sleet, which parks overhead and drops a column - two fliers
  // whose answer was "stop standing there" would be one flier twice. And a
  // line drawn corner to corner does something a patch cannot: it cuts the
  // floor in half, so what it costs is not the ground under it but every route
  // that crossed it.
  //
  // The commit is the tell. It rears, holds a beat, and only then runs - and
  // once it is running it cannot steer, so the whole enemy is answered by
  // being somewhere else by the time it arrives.
  ashwing: {
    hp: 52, speed: 3.6, damage: 0, value: 300, color: 0xff6a2a, eye: 0xffd166,
    scale: 1.0, radius: 0.5, mass: 1,
    fly: { height: 4.6 },
    hitbox: { r: 0.62, y: 0.5 },
    build: buildAshwing, ai: aiAshwing,
  },

  // ---- the afflictors ----------------------------------------------------
  //
  // Six types built around one idea: an attack that is still working after it
  // has landed. Everything before this point resolves the moment it touches
  // you - a hit takes health, a pool takes health while you stand in it, and
  // the instant you are clear you are whole again. These leave something ON
  // the player (see status.js), and the whole design of each one is the gap
  // between when it lands and when it stops costing.
  //
  // THREE RULES HOLD ACROSS THE SIX, and they are what stop a status roster
  // from being a pile of unavoidable taxes:
  //
  //   1. THE STATUS IS THE DAMAGE, not a bonus on top of it. Every one of
  //      these hits for less than its role-mates - a cinder does five where a
  //      chaser does twelve - because what it puts on you is where the cost
  //      lives. A type that dealt full damage AND left a burn would simply be
  //      a better chaser.
  //   2. IT MUST BE REFUSABLE. Something the player can do - move, kill it
  //      first, take an angle - has to prevent it. A status that arrives
  //      whatever you do is a tax, and the correct play against a tax is to
  //      stop reading the screen.
  //   3. IT MUST BE OBVIOUS WHERE IT CAME FROM. Every one of these is loud at
  //      the moment it applies: a cloud you can see from across the arena, a
  //      ring on the floor, a beam drawn between the caster and you. The chip
  //      in the HUD says WHAT is on you; the enemy has to say WHO did it, or
  //      the player learns nothing from being hit.

  // The player's introduction to burning. Fast, brittle, and it barely hits -
  // five points, a third of a chaser's - because the fire it leaves is the
  // attack. It closes, touches you once, and what it did keeps happening for
  // four seconds while it comes back round for another.
  //
  // Refusable by not being touched, which is the most basic answer in the game
  // and the right one to teach a status with.
  cinder: {
    hp: 30, speed: 3.9, damage: 5, value: 200, color: 0xff7a18, eye: 0xffd166,
    scale: 0.95, radius: 0.46, mass: 1,
    melee: { windup: 0.4, start: 1.4, hit: 2.0, cd: 1.2 },
    // Four seconds at the table's seven a second: 28 points spread thin, in
    // exchange for a hit that is worth almost nothing on its own.
    hitStatus: { kind: 'fire', dur: 4 },
    build: buildCinder, ai: aiMelee,
  },

  // EMBER's boss, and the mirror of the Colossus.
  //
  // A Colossus is armoured except for a core on a fixed rhythm, so the fight
  // is a question of WHEN you are firing and the boss has no say in it. This
  // one HEATS UP as it fights - it gains attacks as the bar fills, and when it
  // fills completely it has to stop and VENT, which is when its plates come
  // apart and it takes full damage.
  //
  // So the damage window is the boss's own decision rather than a metronome,
  // and the player's job is to survive long enough to earn one. That inversion
  // is the whole fight, and it is why the vent is not simply a free five
  // seconds: while it is open it is radiating fire outward, so the window is
  // real and it is INSIDE something. Close enough to shoot, far enough not to
  // burn, and the ring is growing the whole time.
  //
  // WHAT THE HEAT BUYS IT. One attack per third of the bar, so the fight
  // visibly escalates toward the vent rather than arriving at it:
  //   below a third   it closes and swings, and that is all
  //   a third         the SWEEP - it plants and turns a bar of fire around
  //                   itself, on the beat, exactly as its kilns do
  //   two thirds      the RING - a wall of fire at a fixed radius with one gap
  //                   in it, so being at the wrong distance is now a mistake
  //   full            it must vent, and the fight resets to the top
  forge: {
    hp: 3400, speed: 2.3, damage: 30, value: 5500, color: 0xff5a1f, eye: 0xffd166,
    scale: 3.0, radius: 1.8, mass: 8, boss: true,
    hitbox: { r: 0.74, y: 0.8 },
    statusMul: 0.3, freezeSlow: true, slowFactor: 0.75, freezeVuln: 1.0,
    entropyExempt: true, fearMode: 'stagger',
    // Reach scaled off a 1.8m body, like Siege's.
    melee: { windup: 0.7, start: 3.2, hit: 4.0, cd: 2.0 },
    // Full damage only while it is venting. armorDefault matches the shut
    // value for Colossus's reason: a damage source arriving with no direction
    // must not be able to bypass the mechanic by accident.
    armor: (e) => (e.bs.venting ? 1 : 0.34),
    armorDefault: 0.34,
    build: buildForge, ai: aiForge,
  },
};

Object.assign(ENEMY_TYPES, TYPES);
