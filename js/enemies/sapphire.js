// SAPPHIRE's six enemies and its boss.
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
import {
  ARENA_HALF, BOSS_REACH_Y, ENEMY_TYPES, FLY_RATE_DEFAULT, MELEE_REACH_Y,
  SHARED_MATS, _blinkAt, _bossAt, _reachY, aiMelee, bossTouch, eyes, faceSnap,
  geo, landHit, orbit, partsFor, prism, releaseMarks, rock, shard, slab,
  snapAim, spike,
} from './shared.js';

// ---- the theme ------------------------------------------------------------
//
// THE THEME OF ACCRUING RESONANCE. Every other theme in the game buys its
// pressure with something that is spent - EMBER spends floor, HIVE spends
// bodies, SOLAR spends information. SAPPHIRE spends NOTHING. Its mechanic is
// the CLOCK: every enemy in it is quiet when it arrives and worse for every
// second it is allowed to keep existing, and the whole theme is one question
// asked seven ways - HOW LONG HAS THAT BEEN ALLOWED TO RING?
//
//   dart      a rusher that runs FASTER EVERY BEAT it survives. The answer is
//             to kill it early or to have already killed it - a dart that
//             reaches you at full ring is a rusher with a brute's pace and
//             the only thing that made it slow was time you spent on
//             something else
//   facet     fires a fan that is one round wider every volley. The first
//             shot is a single dart to step off; the fifth is a wall with a
//             hole in it somewhere
//   cairn     a brute that GROWS A SHELL as it stands - every hit it has
//             absorbed settles as plate, so the cairn you ignored for ten
//             seconds is a different enemy from the one you broke on sight
//   lapidary  lobs a seed of crystal that does nothing where it lands and
//             then SPREADS - the patch grows outward from where it came down,
//             so the ground to give up is not the circle you were shown
//   attuner   a support with no attack that tunes the whole wave to its own
//             pitch: everything inside its ring moves faster, and the stacks
//             come off when it dies - the conduit's answer arrived at from
//             the other end, kill it first because the wave is ringing
//   comet     a flier whose PASSES QUICKEN - each dive is faster than the
//             last and each one it lands shortens the wait for the next, so
//             the second half of its life is a much busier enemy than the
//             first
//
// THE SHARED SILHOUETTE IS THE SEAM. Every body is a cut stone - a dart, a
// facet, a shard - with a lit seam of blue-white light where the crystal was
// parted, and the seam is where every mechanic's tell lives: it brightens as
// a dart rings up, as a facet's fan widens, as a cairn's shell thickens.
// Where PLAGUE is splitting and SOLAR is carrying a mirror, SAPPHIRE is a
// thing HOLDING A NOTE.
//
// SO IT IS THE THEME THAT PUNISHES THE BACK OF THE QUEUE. Every other theme's
// correct answer is "kill the support first"; this one makes the whole roster
// the support, because every body in it is compounding. The question is not
// what to kill but how long anything in the room has been alive.

// ---- the dart ---------------------------------------------------------------

// How much pace a dart gains per HALF-BEAT, and the ceiling. The ceiling is a
// quarter again its base speed - past that the step clamp and the player's
// own sprint stop mattering and the enemy becomes a coin flip, which is the
// one thing a rusher may never be.
export const DART_GAIN = 0.075;

export const DART_MAX = 1.25;

// ---- the facet ---------------------------------------------------------------

// The fan: how wide the outermost arms sit from the centre line, in radians,
// and how much wider each volley makes them. The first fan is a single lane;
// the fifth is nearly a half-beat of ground.
export const FACET_FAN = 0.08;

export const FACET_FAN_GAIN = 0.045;

export const FACET_FAN_CAP = 0.26;

export const FACET_CD = 2.6;

export const FACET_RANGE = 21;

// The tell, in seconds of the seam flaring before the fan leaves.
export const FACET_TELL = 0.45;

// ---- the cairn ----------------------------------------------------------------

// The shell. Each landed blow settles a slice of the damage it dealt as
// permanent plate: PLATE_MAX caps what a single blow may settle (so one huge
// blast does not instantly finish the shell), SHELL_CAP caps the whole thing,
// and the settle rate is measured against the cairn's OWN BAR so the shell
// reaches its cap at the same point of the fight on wave 4 and on wave 44 -
// a cairn is a walking argument about target priority, not a wall that only
// the early game can break.
export const CAIRN_PLATE_MAX = 12;

export const CAIRN_SHELL_CAP = 0.62;

// How fast the bar turns to shell. 0.85 means the cap arrives once roughly
// three quarters of the bar has been dealt in blows: the first half of a
// cairn's life is nearly soft and the last quarter is at the cap, which is
// the whole argument for killing it early in one number.
export const CAIRN_SETTLE = 0.85;

// ---- the lapidary ----------------------------------------------------------------

// The seed it throws, and what grows out of it. Nothing lands as a patch the
// size of the circle the player was shown: the SPREAD is the enemy, and it is
// why the mortar's own ring is drawn at the FINAL radius from the moment the
// seed comes down - the ground being asked about is the ground the patch will
// reach, not the ground it starts on.
export const LAPIDARY_CD = 4.6;

export const LAPIDARY_RANGE = 22;

export const LAPIDARY_TELL = 0.5;

// The patch the seed becomes: its FINAL radius (the ring the mortar draws and
// the edge grows out to over two seconds), how long it lasts and what it
// costs to stand on. The spread fraction itself lives on the crystal row in
// main.js's HAZARD_KINDS, beside every other patch's behaviour, and is
// deliberately not repeated here - the two tables have one number between
// them, not two that can drift.
export const CRYSTAL_R = 3.4;

export const CRYSTAL_LIFE = 7;

export const CRYSTAL_DPS = 10;

// The seed's flight time and the mortar delay the sprout rides on. They are
// the same number so the patch begins spreading the frame the ring said it
// would - a delay on top of the flight would be a second clock to read.
export const SEED_FLY = 1.1;

// ---- the attuner ----------------------------------------------------------------

// The ring's reach, how often it stacks, what a stack is worth and the cap.
// The stacks come OFF when the attuner dies - the whole difference between
// this and a nurse's carapace, and what makes the attuner the answer every
// other support in the game already is: kill it first.
export const ATTUNE_RANGE = 9;

export const ATTUNE_INTERVAL = 2.2;

export const ATTUNE_STACK = 0.06;

export const ATTUNE_CAP = 0.42;

// How much of the stack shows on the body. Sized against the enemy's own
// model so a dart and a cairn swell by the same fraction - the ring's carrier
// must be findable in a crowd from its glow alone.
export const ATTUNE_SWELL = 0.5;

// ---- the comet ----------------------------------------------------------------

// The loop: how high it holds, how long the windup is, and the two numbers
// that accrue. PACE_GAIN climbs per pass landed, FALL_GAIN shortens the wait
// between passes, and both are capped so the enemy stays a dive the player
// reads rather than a teleport.
export const COMET_HIGH = 5.0;

export const COMET_WINDUP = 0.85;

export const COMET_DIVE_TIME = 1.3;

export const COMET_CLIMB_TIME = 1.5;

export const COMET_PACE_GAIN = 0.18;

export const COMET_PACE_CAP = 1.9;

export const COMET_FALL_GAIN = 0.16;

export const COMET_FALL_CAP = 0.42;

export const COMET_HIT_RANGE = 1.9;

// ---- the boss ----------------------------------------------------------------
//
// THE CARILLON, REBUILT. The theme's whole mechanic - ACCRUING RESONANCE -
// rung at fight scale, and kept MOVING: the old tower held a corner and let
// two clocks do the fighting; this one walks the room, and the fight is where
// it is. Six attacks plus the payoff, every one announced in the game's own
// telegraph language, every one a question about SPACE rather than ammo:
//
//   the PEAL      the volley (kept) - a ring of spokes, one round wider every
//                 time it fires, on a cooldown that SHORTENS as the bar falls.
//                 Fired ON THE MOVE, because the tower does not stop to ring.
//   the GLISS     the lane - the bells lean back, a corridor lights down the
//                 bearing the player was caught on, and the whole tower COMES
//                 DOWN IT at a dead run. It ends in a slam that sets the
//                 lane's end as spreading glass, and the beat it spends
//                 getting back up is the player's to spend.
//   the ECHO      the trail - it plants and reads the player's own last three
//                 footsteps OUT LOUD, one note at a time, then rings each one
//                 back as a detonation in the order they were taken. The safe
//                 ground is the ground you have NOT stood on.
//   the CASCADE   the rain - the top bell keeps time over half a dozen pours,
//                 and a chime lands where the player is GOING at every one of
//                 them, walking the explosions down their own line of escape.
//   the BOUND     the step - it marks a circle across the room, crouches, and
//                 CROSSES the arena to it, landing in a ring of crystal. A
//                 carillon was never meant to stay where you put it.
//   the TOLL      the claim (kept) - it plants, and the floor where it stands
//                 rings out as a gapped circle of crystal that SPREADS.
//   the FULL RING the accrual's bill - every attack it finishes winds the
//                 tower one notch (worn on the bells, so the clock is READ,
//                 not felt), and at the cap it rings everything at once: a
//                 nine-metre toll that detonates with a spoke wall inside it
//                 and sets the ground it covered as glass.
//
//   the RISING    under a third of the bar, everything at once (kept): the
//   (once)        peal doubles up, the resonance cap drops to four, and the
//                 last movement of the fight is its loudest.
//
// And standing ON it costs, in every state - the tower is always live.

// The peal: how wide the spoke gaps are, how much wider each volley, the cap,
// the base cooldown and the tell. The cooldown is HALF what the old fight ran
// - the volley is the fight's metronome now, not its chorus.
export const PEAL_N = 10;

export const PEAL_N_GAIN = 1;

export const PEAL_N_CAP = 18;

export const PEAL_CD = 2.4;

export const PEAL_TELL = 0.45;

// The second ring, offset half a step, that the rising ALWAYS adds and a
// fully-wound tower adds on its last notch - the nova never arrives cold.
export const PEAL_ECHO_T = 0.34;

// The toll: the tell, the inner radius, the patch count and what each one is.
export const TOLL_TELL = 0.85;

export const TOLL_R = 6.5;

export const TOLL_N = 10;

export const TOLL_PATCH_R = 2.2;

// One ring of crystal, and every ring SHARES the hiveblood-style cap through
// the crystal kind's own queue - the pool does the eviction, not the boss.
export const TOLL_LIFE = 7.5;

export const TOLL_DPS = 12;

export const TOLL_CD = 7.5;

// Where on the bar the rising fires, and what it takes off.
export const RISING_FRAC = 0.34;

// ---- the rounds ---------------------------------------------------------------
// The tower no longer sways around the player; it WALKS between ringing
// posts, a loose circle of standpoints held at reading range of the player,
// re-picked before the current one goes stale. That, the gliss and the bound
// are the answer to the old fight's one failing - the corner it never left.
export const CAR_POST_MIN = 7;

export const CAR_POST_MAX = 12;

export const CAR_POST_T = 2.4;

// The scheduler's two gaps: how long after NOTHING was ready it asks again,
// and how long after an attack ENDS the next one begins. The second is the
// whole tempo argument of the fight - just long enough to breathe, never long
// enough to settle.
export const CAR_GAP = 0.5;

export const CAR_NEXT = 1.15;

// The attack rotation. The peal is NOT in it - the volley runs on its own
// clock and fires on the move; this is the order the committed attacks cycle
// through, each with its own cooldown as a second gate, so the fight is
// learnable and never a loop you can set your watch by.
export const CAR_ROT = ['gliss', 'cascade', 'bound', 'toll', 'echo'];

// ---- the gliss ---------------------------------------------------------------
// The lane: tell, length, half-width, the pace of the run itself, and the two
// bills - what getting rung THROUGH costs and what the slam at the end costs.
// GLISS_SPEED beats the player's sprint (15): the dodge is a STEP OFF THE
// LANE, taken inside the tell, and a lane that tracked would be an
// unavoidable hit wearing a warning.
export const GLISS_TELL = 0.85;

export const GLISS_LEN = 16;

export const GLISS_HALF = 1.5;

export const GLISS_SPEED = 13.5;

export const GLISS_TIME = 1.7;

export const GLISS_CD = 6.5;

export const GLISS_CAP = 30;

// The slam the run lands in, and the glass the lane's end sets as. Shared by
// the BOUND's landing, which is the same arrival at a different speed.
export const SLAM_R = 4.4;

export const SLAM_CAP = 24;

export const SLAM_PATCH_R = 2.6;

export const SLAM_PATCH_LIFE = 6;

// ---- the echo -----------------------------------------------------------------
// The trail. Three samples, ECHO_STEP apart, taken of where the player IS at
// that instant; each rings back ECHO_FUSE after it was taken, in the order
// they were taken. A player who keeps moving is missed by their own shadow;
// a player who doubles back walks into it; a player who STANDS is hit by all
// three at once, which is the lesson.
export const ECHO_TELL = 1.0;

export const ECHO_STEP = 0.35;

export const ECHO_FUSE = 0.85;

export const ECHO_R = 3.1;

export const ECHO_CAP = 24;

export const ECHO_CD = 6.5;

// ---- the cascade ---------------------------------------------------------------
// The rain. CASCADE_N pours, CASCADE_STEP apart, each re-reading the player's
// POSITION AND FLIGHT at the moment it is poured - the rain walks with them,
// and the loan they took for a straight line of escape is called in along
// the whole length of it. Each circle fills CASCADE_DELAY before it lands,
// which is the game's mortar contract from end to end.
export const CASCADE_TELL = 0.55;

export const CASCADE_N = 6;

export const CASCADE_STEP = 0.17;

export const CASCADE_DELAY = 0.6;

export const CASCADE_LEAD = 0.3;

export const CASCADE_R = 2.1;

export const CASCADE_DMG = 12;

export const CASCADE_CD = 5;

// ---- the bound -----------------------------------------------------------------
// The relocation. A circle is marked across the room, the tower crouches, and
// then it CROSSES there - over the fight this walks the arena itself, so the
// glass is never laid along one kiting path and the player is never fighting
// the same room twice. The landing is the slam, at its own radius.
export const BOUND_TELL = 0.7;

export const BOUND_MIN = 7;

export const BOUND_MAX = 15;

export const BOUND_RING = 10;

export const BOUND_SPEED = 11;

export const BOUND_CAP = 24;

export const BOUND_SLAM_R = 3.6;

export const BOUND_CD = 6.5;

export const BOUND_PATCH_R = 3.2;

export const BOUND_PATCH_LIFE = 6.5;

// ---- the full ring ---------------------------------------------------------------
// The accrual's payoff. RES_CAP finished attacks wind the tower full (fewer
// under the rising), and then it plants, fills a nine-metre toll for anyone
// to read, and rings EVERYTHING: the blast, a spoke wall over the peal's own
// count, and the ground it covered setting as glass.
export const RES_CAP = 7;

export const RES_CAP_RISING = 4;

export const FULL_TELL = 1.35;

export const FULL_R = 9.5;

export const FULL_CAP = 38;

export const FULL_DMG_MUL = 1.25;

export const FULL_SPOKES = 6;

export const FULL_PATCHES = 4;

export const FULL_PATCH_R = 2.2;

export const FULL_PATCH_LIFE = 6;

// Scratch, module-level and reused: the toll's laying and every burst run
// more than once a second across a whole wave.
export const _sapAt = new THREE.Vector3();

export const _sapTo = new THREE.Vector3();

// ---- the models -----------------------------------------------------------

// A sliver of crystal leaning hard forward, all edge. THE SEAM runs down its
// back - the lit line where the stone was parted - and it brightens as the
// dart rings up, which is the only honest readout of a number the player is
// otherwise asked to feel.
export function buildDart(e, g, s) {
  const P = partsFor(e, g, s);
  // THE POINT. A dart is its head: narrow, swept forward and down, taking up
  // the whole front of the silhouette.
  P('dartHead', spike(0.26, 0.62, 4), { y: 0.92, z: -0.18, rx: -Math.PI / 2.1 });
  eyes(P, { y: 1.1, x: 0.12, z: -0.42, r: 0.55, mat: e.eyeMat });
  // THE SEAM, riding the spine. Bright, thin, and the whole tell.
  e.seamMesh = P('dartSeam', slab(0.06, 0.56, 0.08), {
    y: 1.02, z: 0.3, mat: e.eyeMat, shadow: false,
  });
  // A small body behind the point, leaning into the run.
  P('dartBody', prism(0.16, 0.1, 0.6, 4), { y: 0.78, z: 0.1, rx: -0.3 });
  // Two blade legs, long and sprung - the posture of something that is only
  // ever getting faster.
  P('dartLeg', slab(0.06, 0.56, 0.06), { x: -0.16, y: 0.3, rz: 0.3 });
  P('dartLeg', slab(0.06, 0.56, 0.06), { x: 0.16, y: 0.3, rz: -0.3 });
}

// A faceted head on a thin neck, with the seam across the chest. THE FAN IS
// THE ENEMY and the model says so: the head is a gem with flat faces, and it
// visibly tracks the player the whole time.
export function buildFacet(e, g, s) {
  const P = partsFor(e, g, s);
  // THE GEM. Wide at the top of a thin body, cut flat, so from any bearing
  // the outline is stone first and stalk second.
  P('facetHead', shard(0.4), { y: 1.3, sy: 1.2 });
  eyes(P, { y: 1.36, x: 0.1, z: -0.32, r: 0.65, mat: e.eyeMat });
  // THE SEAM across the chest. It flares with the fan's tell and widens with
  // the volley count - the enemy's whole clock, worn on the front.
  e.seamMesh = P('facetSeam', slab(0.3, 0.06, 0.06), {
    y: 1.06, z: -0.2, mat: e.eyeMat, shadow: false,
  });
  // A thin column under the gem, and a wide foot for balance.
  P('facetBody', prism(0.11, 0.16, 0.58, 4), { y: 0.84, rx: -0.1 });
  P('facetFoot', slab(0.36, 0.08, 0.36), { y: 0.16 });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
    P('facetLeg', slab(0.05, 0.5, 0.05), {
      x: Math.cos(a) * 0.2, y: 0.26, z: Math.sin(a) * 0.2,
      rz: -Math.cos(a) * 0.5, rx: Math.sin(a) * 0.5,
    });
  }
}

// A stack of stones with the seam glowing between them. THE SHELL is what the
// model is: a cairn is a pile, and the pile GROWS as it stands - every part
// the shell adds rides the outside of the body, so a cairn you ignored is
// visibly a bigger cairn.
export function buildCairn(e, g, s) {
  const P = partsFor(e, g, s);
  // THE PILE. Three stones stacked, widest at the base - the read of a thing
  // that has been standing long enough to settle.
  P('cairnBase', rock(0.5), { y: 0.72, sx: 1.3, sy: 0.9, sz: 1.15 });
  P('cairnMid', rock(0.38), { y: 1.3, sx: 1.15, sy: 0.95, sz: 1.05 });
  P('cairnTop', rock(0.24), { y: 1.7, sx: 1.1, sy: 1.0, sz: 1.0 });
  // THE SEAM between the two lower stones, bright - the only light on a body
  // built to read as a landmark.
  e.seamMesh = P('cairnSeam', slab(0.5, 0.07, 0.5), {
    y: 1.0, mat: e.eyeMat, shadow: false,
  });
  // Two thick splayed arms, short and heavy - a brute stands, it does not
  // swing far.
  P('cairnArm', slab(0.2, 0.6, 0.22), { x: -0.52, y: 1.0, rz: 0.28 });
  P('cairnArm', slab(0.2, 0.6, 0.22), { x: 0.52, y: 1.0, rz: -0.28 });
  eyes(P, { y: 1.74, x: 0.1, z: -0.22, r: 0.5, mat: e.eyeMat });
  // The shell starts EMPTY: nothing to draw until there are stacks.
  e.shellParts = [];
}

// A tripod carrying a cut stone over its front, tipped toward the floor - the
// same posture as the lens, but solid stone rather than glass, and the seam is
// the aim.
export function buildLapidary(e, g, s) {
  const P = partsFor(e, g, s);
  // THE STONE IT THROWS, riding the front of the body where the whole arena
  // can see it - the cargo is the enemy, and it is the tell: the stone LIFTS
  // off the mount before the throw.
  e.seedMesh = P('lapidStone', shard(0.26), { y: 1.14, z: -0.32, sy: 1.25 });
  // THE MOUNT, a wide angled rest under the stone, tilted into the throw.
  P('lapidYoke', slab(0.46, 0.1, 0.4), { y: 0.88, z: -0.26, rx: 0.2 });
  // A thin column and three splayed legs - it was put down, it did not walk.
  P('lapidColumn', slab(0.12, 0.56, 0.12), { y: 0.5, z: 0.06 });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    P('lapidLeg', slab(0.06, 0.6, 0.06), {
      x: Math.cos(a) * 0.24, y: 0.3, z: Math.sin(a) * 0.24,
      rz: Math.cos(a) * -0.5, rx: Math.sin(a) * 0.5,
    });
  }
  eyes(P, { y: 0.86, x: 0.09, z: -0.18, r: 0.6, mat: e.eyeMat });
}

// A tuning fork of a body: two prongs stood apart on one handle, with the
// stone that tunes hanging between them. Nothing about it is armed - it is a
// device, and the whole enemy is the ring it draws on the floor.
export function buildAttuner(e, g, s) {
  const P = partsFor(e, g, s);
  // THE PRONGS. Two, wide apart, flared at the top - the read of the gap is
  // the whole silhouette, exactly as the capacitor's plates are.
  P('attuneProng', slab(0.1, 0.9, 0.12), { x: -0.34, y: 1.0, rz: 0.18 });
  P('attuneProng', slab(0.1, 0.9, 0.12), { x: 0.34, y: 1.0, rz: -0.18 });
  // THE STONE, floating clear between the prongs and ABOVE them - the lit
  // thing the wave is being tuned to, and the enemy's finder in a crowd.
  e.tuneStone = P('attuneStone', shard(0.2), {
    y: 1.86, mat: e.eyeMat, shadow: false,
  });
  // A single column under the fork, and a wide base it does not leave.
  P('attuneHandle', prism(0.14, 0.2, 0.4, 4), { y: 0.5 });
  P('attuneBase', slab(0.5, 0.12, 0.5), { y: 0.14 });
  // One eye, dead centre in the stone: a device that watches, like the
  // halo's and the capacitor's - the supports that take the player's pace
  // rather than their health look at them the same way.
  eyes(P, { y: 1.86, x: 0.08, z: -0.18, r: 0.8, mat: e.eyeMat });
  // THE FIELD, at exactly the radius it works at, drawn on the floor the way
  // the halo's is - a player who cannot see where the ring starts and stops
  // is playing a game that has broken rather than one that is doing something
  // to them.
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x8ad9ff, transparent: true, opacity: 0.3,
    side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  e._extraMats.push(ringMat);
  const ring = new THREE.Mesh(
    geo('attuneField', () => new THREE.RingGeometry(ATTUNE_RANGE - 0.26, ATTUNE_RANGE, 56)),
    ringMat
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.05;
  // Nine metres across; the same exemption the halo's and the warden's take.
  ring.userData.noCorpse = true;
  g.add(ring);
  e.ringMat = ringMat;
}

// A spear of crystal with two swept vanes and a lit belly. Longer than it is
// tall, and every line on it points forward - the read of a thing that kills
// by arriving, faster each time.
export function buildComet(e, g, s) {
  const P = partsFor(e, g, s);
  // THE BODY, laid along its own line of travel: narrow end forward, the way
  // the shrike's is, but faceted rather than smooth - a cut stone, not a
  // blade.
  P('cometBody', prism(0.12, 0.26, 0.78, 4), { y: 1.0, z: 0.04, rx: -Math.PI / 2 });
  // THE POINT, and the entire enemy: a crystal tip with no other attack.
  P('cometTip', spike(0.11, 0.44, 4), {
    y: 1.0, z: -0.52, rx: -Math.PI / 2, mat: SHARED_MATS.sapphireStone,
  });
  // THE SEAM, along the flank - it brightens as the passes quicken, so the
  // second half of its life is visibly the busier one.
  e.seamMesh = P('cometSeam', slab(0.06, 0.05, 0.44), {
    y: 0.92, z: -0.02, mat: e.eyeMat, shadow: false,
  });
  // Two vanes swept back hard, and a barbed tail.
  P('cometVane', slab(0.66, 0.04, 0.26), { x: -0.42, y: 1.12, z: 0.12, ry: 0.55, rz: 0.22 });
  P('cometVane', slab(0.66, 0.04, 0.26), { x: 0.42, y: 1.12, z: 0.12, ry: -0.55, rz: -0.22 });
  P('cometTail', spike(0.05, 0.26, 4), { y: 1.14, z: 0.5, rx: Math.PI / 2 });
  // Lit belly, the shared airborne read - in the theme's own seam colour
  // rather than the harrierGlow cyan, which is SOLAR's flier's and would read
  // as the wrong family from the floor.
  P('cometBelly', slab(0.1, 0.05, 0.44), {
    y: 0.88, z: -0.02, mat: SHARED_MATS.sapphireSeam, shadow: false,
  });
  eyes(P, { y: 1.04, x: 0.09, z: -0.3, r: 1.0, mat: e.eyeMat });
}

// THE CARILLON. A tower of bells: three stones hung one above another on a
// crowned column, each lit where it was struck, and the whole thing sways as
// it walks. The bells are the brood read at distance - they flare before a
// peal, and the top bell is what the rising takes its cap off.
export function buildCarillon(e, g, s) {
  const P = partsFor(e, g, s);
  // THE BELLS. Three, hanging one above another, each a cut stone with its
  // own lit facet - the tower is the fight, and the tower is what the player
  // is asked to read from anywhere in the room.
  e.bs.bells = [];
  for (let i = 0; i < 3; i++) {
    const b = P('carBell', shard(0.34 - i * 0.06), {
      y: 2.1 - i * 0.5, sy: 1.15, mat: e.eyeMat, shadow: false,
    });
    e.bs.bells.push(b);
  }
  // The column they hang on, and the crown above it.
  P('carColumn', prism(0.3, 0.4, 1.5, 6), { y: 1.1, mat: SHARED_MATS.gunmetal });
  const crownGeo = spike(0.1, 0.55, 4);
  for (let i = 0; i < 5; i++) {
    const ang = (i / 5) * Math.PI * 2;
    P('carSpike', crownGeo, {
      x: Math.cos(ang) * 0.42, y: 2.68, z: Math.sin(ang) * 0.42,
    });
  }
  // A head set low on the column, between the shoulders of it.
  P('carHead', shard(0.18), { y: 1.72, z: -0.14 });
  eyes(P, { y: 1.76, x: 0.1, z: -0.28, r: 0.9, mat: e.eyeMat });
  // THE SKIRT. Wide, planted, meeting the floor the way the herald's robe
  // does - a boss that sways rather than walks, and the sway is in the AI.
  P('carSkirt', prism(0.5, 0.72, 0.9, 6), { y: 0.44 });
  // Two long arms hung low, ending in stone hands - a carillon is played,
  // and it should look like the thing that plays it. Kept on bs so the AI
  // can raise them: the tower's tells are PLAYED, not just lit.
  e.bs.arms = [
    P('carArm', slab(0.1, 1.1, 0.1), { x: -0.62, y: 1.2, rz: 0.3 }),
    P('carArm', slab(0.1, 1.1, 0.1), { x: 0.62, y: 1.2, rz: -0.3 }),
  ];
  P('carHand', rock(0.16), { x: -0.78, y: 0.62 });
  P('carHand', rock(0.16), { x: 0.78, y: 0.62 });
}

// ---- the AI ----------------------------------------------------------------

// THE DART. The shared melee cycle and nothing else - the enemy's whole
// second half is the pace, and the pace is driven by the beat, not by a
// timer of its own. Music.pulse is a monotonic counter, and the INEQUALITY
// (not order) is what cannot miss a beat in a long frame or fire twice in a
// short one - the same contract the kiln's sweep keeps.
export function aiDart(e, a) {
  if (e._dartPulse === undefined) e._dartPulse = a.ctx.pulse;
  if (a.ctx.pulse !== e._dartPulse) {
    e._dartPulse = a.ctx.pulse;
    e.dartRing = Math.min(DART_MAX, (e.dartRing || 0) + DART_GAIN);
    e._setEyeAlert(e.dartRing >= DART_MAX);
  }
  // THE SEAM IS THE READOUT. It brightens with the ring and flares on the
  // beat the pace steps - a player watching the crowd sees which darts have
  // been allowed to ring without having to time anything.
  if (e.seamMesh) {
    const k = (e.dartRing || 0) / DART_MAX;
    e.seamMesh.scale.setScalar((0.7 + k * 0.9) * e.scale);
  }
  // The pace, applied where every speed read in the class already goes.
  a.sp = a.sp * (1 + (e.dartRing || 0));
  aiMelee(e, a);
}

// THE FACET. A simultaneous fan whose arms sit wider every volley - the
// mechanic is the WIDTH, and the width is a clock the player can hear: each
// fan is one round larger than the last, and the fifth is a wall with a
// gap in it somewhere.
export function aiFacet(e, a) {
  orbit(e, a, ENEMY_TYPES.facet.orbit);
  if (e.facT > 0) {
    e.facT -= a.dt;
    const k = 1 - Math.max(0, e.facT) / FACET_TELL;
    if (e.seamMesh) e.seamMesh.scale.setScalar((0.8 + k * 0.9) * e.scale);
    if (e.facT > 0) return;
    if (e.seamMesh) e.seamMesh.scale.setScalar(0.8 * e.scale);
    e._setEyeAlert(false);
    const w = Math.min(FACET_FAN_CAP, FACET_FAN + (e.facVolley || 0) * FACET_FAN_GAIN);
    const arms = (e.facVolley || 0) >= 2 ? 1 + ((e.facVolley || 0) - 1) : 1;
    for (let i = 0; i < arms; i++) {
      const off = (i - (arms - 1) / 2) * w;
      a.ctx.addProjectile(e.pos.x, 1.1, e.pos.z, 'facet', e._projScale(), off);
    }
    // Every volley it lands widens the next one. The cap keeps the fan a
    // question with a side to it rather than a semicircle.
    e.facVolley = Math.min(5, (e.facVolley || 0) + 1);
    _sapAt.set(e.pos.x, 1.1, e.pos.z);
    if (a.ctx.effects) a.ctx.effects.burst(_sapAt, 0x9ee8ff, 8, 3, 2, 0.4);
    return;
  }
  if (e.attackCd > 0 || a.dist > FACET_RANGE) return;
  e.attackCd = FACET_CD + Math.random() * 0.8;
  e.facT = FACET_TELL;
  e.flash = 0.14;
  e._setEyeAlert(true);
}

// THE CAIRN. The shell is what landed on it, settled: each landed BLOW
// converts a slice of the damage it dealt into permanent plate. The read is a
// bar-delta off the enemy's own hp - the dynamo's contract, never a hook into
// takeDamage - with one addition the dynamo does not need: the SILENT half of
// the delta is subtracted back out, because the shell is made of blows and a
// burn tick is not one. The dot's own damage is exactly known - it ticks on
// the pulse edge, in _tickStatus, before any ai() runs, at _dot's power - so
// subtracting it off the same edge leaves the loud share, exact.
//
// Burn and venom are therefore the patient answer to the shell twice over:
// they read the enemy bare (armorDefault 1, the bulwark's rule) AND they
// never feed the thing they are not stopped by.
export function aiCairn(e, a) {
  if (e._cairnHp === undefined) { e._cairnHp = e.hp; e._cairnPulse = a.ctx.pulse; }
  const took = e._cairnHp - e.hp;
  e._cairnHp = e.hp;
  // The dot share of that delta, mirrored tick for tick off the same pulse
  // edge _tickStatus ticks on - see the note above.
  let dot = 0;
  if (a.ctx.pulse !== e._cairnPulse) {
    if (e.status.burn > 0) dot += e._dot.burn;
    if (e.status.poison > 0 && a.ctx.pulseWhole) dot += e._dot.poison * e.poisonStacks;
  }
  e._cairnPulse = a.ctx.pulse;
  const loud = Math.max(0, took - dot);
  if (loud > 0) {
    // Settled as a fraction of the cairn's OWN BAR, so the shell means the
    // same thing wherever the block landed - see CAIRN_SETTLE.
    e.shell = Math.min(CAIRN_SHELL_CAP, (e.shell || 0)
      + Math.min(CAIRN_PLATE_MAX, loud) * CAIRN_SETTLE / e.maxHp);
  }
  aiMelee(e, a);
  // THE SHELL, drawn every frame: the stones ride the outside of the body
  // and grow with it, so a cairn you ignored is visibly a bigger cairn.
  if (e.shellParts) {
    const want = Math.ceil((e.shell || 0) / (CAIRN_SHELL_CAP / 8));
    while (e.shellParts.length < Math.min(want, 8)) {
      const i = e.shellParts.length;
      const ang = (i / 8) * Math.PI * 2 + (i % 2) * 0.39;
      const base = e.group.children[0];
      // Cheap and deliberate: the stones are drawn with the base part's own
      // material so they inherit its flash and its status tint - a shell
      // stone is the cairn's body, not trim on it.
      const st = new THREE.Mesh(
        geo('cairnShell', () => new THREE.DodecahedronGeometry(0.13, 0)),
        base.material
      );
      st.position.set(Math.cos(ang) * 0.58, 0.36 + (i % 3) * 0.3, Math.sin(ang) * 0.52);
      st.scale.setScalar(e.scale);
      st.castShadow = true;
      e.group.add(st);
      e.shellParts.push(st);
    }
  }
  if (e.seamMesh) {
    const k = (e.shell || 0) / CAIRN_SHELL_CAP;
    e.seamMesh.scale.setScalar((0.7 + k * 0.8) * e.scale);
  }
}

// The cairn's armour: the settled shell, read as a multiplier. Directionless
// damage falls to 1 - the patient answer to a shell made of the player's own
// impatience is damage that never lands a blow to settle, and burn and venom
// are exactly that.
export function cairnArmor(e) {
  return 1 - Math.min(CAIRN_SHELL_CAP, e.shell || 0);
}

// Where the lapidary's next seed comes down. Returns false when eight tries
// found nothing usable, in which case the lapidary keeps its cooldown and
// tries again next interval - a throw at the wall is a wasted clock.
function _pickSeedSpot(e, a) {
  const p = a.ctx.player;
  const off = Math.max(3.5, Math.min(8, 3 + a.dist * 0.3));
  for (let i = 0; i < 8; i++) {
    const ang = Math.random() * Math.PI * 2;
    const r = off * (0.8 + Math.random() * 0.5);
    const x = p.pos.x + Math.cos(ang) * r;
    const z = p.pos.z + Math.sin(ang) * r;
    if (Math.abs(x) > 20 || Math.abs(z) > 20) continue;
    if (Math.hypot(x - e.pos.x, z - e.pos.z) < e.radius + 1.5) continue;
    _sapAt.set(x, 0.4, z);
    if (a.ctx.obstacles && _obstacleAt(_sapAt, a.ctx.obstacles)) continue;
    _sapTo.set(x, 0, z);
    return true;
  }
  return false;
}

// A point-in-box test, local rather than imported from utils.js: the
// lapidary is the only thing in this file that needs it, and the theme files
// import from utils.js only when more than one of their bodies does.
function _obstacleAt(v, boxes) {
  for (const b of boxes) {
    if (v.x >= b.min.x && v.x <= b.max.x && v.z >= b.min.z && v.z <= b.max.z) return true;
  }
  return false;
}

// THE LAPIDARY. It throws a seed that lands as a MORTAR at the FINAL radius -
// the circle the player is shown is the ground the patch will reach, not the
// ground it starts on - and the patch then SPREADS outward from where it came
// down over the next two seconds. The whole enemy is the difference between
// where the ring was drawn and where the edge ends up.
export function aiLapidary(e, a) {
  orbit(e, a, ENEMY_TYPES.lapidary.orbit);
  // A mortar that lands as ground. What the seed becomes - the radius, life
  // and dps of the patch, at the FINAL size, so the ring the mortar fills is
  // the ground the patch will reach rather than the ground it starts on.
  // Routed through addMortar's `ground` payload rather than addHazard: the
  // seed IS a delayed impact that leaves ground, and the telegraph belongs
  // to the mortar's own machinery.
  if (e.lapT > 0) {
    e.lapT -= a.dt;
    const k = 1 - Math.max(0, e.lapT) / LAPIDARY_TELL;
    // THE STONE LIFTS off the mount as the throw comes - the enemy has no
    // barrel to point, so the cargo rising is the aim.
    if (e.seedMesh) e.seedMesh.position.y = (1.14 + k * 0.34) * e.scale;
    if (e.lapT > 0) return;
    if (e.seedMesh) e.seedMesh.position.y = 1.14 * e.scale;
    e._setEyeAlert(false);
    if (_pickSeedSpot(e, a) && a.ctx.addMortar) {
      // The ring is drawn at the FINAL radius and the patch lands at
      // (1 - spread) of it, growing out to the ring over two seconds - the
      // circle the player was shown is the ground the patch will reach, not
      // the ground it starts on. See the crystal row in HAZARD_KINDS.
      a.ctx.addMortar(
        _sapTo.x, _sapTo.z, CRYSTAL_R, SEED_FLY, 0,
        { radius: CRYSTAL_R, life: CRYSTAL_LIFE, dps: CRYSTAL_DPS, kind: 'crystal' }
      );
      // The mortar's own ring does the warning; this is the moment the throw
      // left, so the burst is AT THE LAPIDARY and not at the landing.
      _sapAt.set(e.pos.x, 1.4, e.pos.z);
      a.ctx.effects.burst(_sapAt, 0x9ee8ff, 14, 4, 2.4, 0.5);
      a.ctx.effects.addShake(0.1);
    }
    return;
  }
  if (e.attackCd > 0 || a.dist > LAPIDARY_RANGE) return;
  e.attackCd = LAPIDARY_CD + Math.random() * 1.2;
  e.lapT = LAPIDARY_TELL;
  e.flash = 0.14;
  e._setEyeAlert(true);
}

// THE ATTUNER. Every interval, everything inside the ring - the player
// excepted - takes a stack of pace, and the stacks come OFF when it dies.
// The conduit's buff dies with the conduit; a nurse's carapace never comes
// off at all; this one is the third thing, a stack that accumulates but is
// wound back to nothing the moment its source goes. The answer is the
// support's answer always - kill it first - arrived at from the mechanic of
// the whole theme: the wave is ringing, and this is what is ringing it.
export function aiAttuner(e, a) {
  orbit(e, a, ENEMY_TYPES.attuner.orbit);
  // The stone turns and swells toward the next stack, so the enemy's own
  // clock is on it the way the facet's seam is.
  if (e.tuneStone) {
    e.tuneStone.rotation.y += a.dt * 1.2;
    const k = 1 - Math.max(0, e.attCd || 0) / ATTUNE_INTERVAL;
    e.tuneStone.scale.setScalar((0.85 + k * 0.5) * e.scale);
  }
  e.attCd = (e.attCd || 0) - a.dt;
  const ready = e.attCd <= 0;
  e._setEyeAlert(ready);
  if (!ready) return;
  e.attCd = ATTUNE_INTERVAL;

  let n = 0;
  for (const o of a.ctx.enemies) {
    if (o === e || o.dead || o.type === 'attuner') continue;
    const dx = o.pos.x - e.pos.x;
    const dz = o.pos.z - e.pos.z;
    if (dx * dx + dz * dz > ATTUNE_RANGE * ATTUNE_RANGE) continue;
    // THE STACK. Capped, and applied as PACE - never as damage, never as
    // resistance - because the attuner's whole argument is that the wave
    // gets faster the longer it rings, not that it hits harder.
    o.attuned = Math.min(ATTUNE_CAP, (o.attuned || 0) + ATTUNE_STACK);
    // The swelling is the visible half of the stack, sized against the
    // target's own model so a dart and a cairn read the same.
    o.group.scale.setScalar(1 + o.attuned * ATTUNE_SWELL);
    n++;
    if (a.ctx.effects) a.ctx.effects.beam(e.pos, o.pos, 0x5bd0ff);
  }
  if (n && a.ctx.effects) {
    _sapAt.set(e.pos.x, 1.9, e.pos.z);
    a.ctx.effects.burst(_sapAt, 0x9ee8ff, 10, 3, 2, 0.4);
  }
  // THE RING IS DRAWN AT EXACTLY THE RADIUS IT WORKS AT, and it brightens
  // while anything is inside it - the halo's contract, for the halo's reason.
  if (e.ringMat) {
    const p = a.ctx.player;
    const inside = p && Math.hypot(p.pos.x - e.pos.x, p.pos.z - e.pos.z) < ATTUNE_RANGE;
    e.ringMat.opacity = inside || n > 0 ? 0.8 : 0.3;
  }
}

// THE ATTUNER'S DEATH. The stacks it handed out come OFF - the nurse's
// carapace never comes off and the conduit's buff lapses on its own, and
// this is deliberately neither: the wave was tuned to a pitch and killing the
// thing holding the pitch un-tunes it. Walked over the live roster from
// onDeath rather than kept as a list of who was stacked, so a body the
// attuner never reached costs nothing to check and a body it did cannot be
// missed.
export function attunerOnDeath(e, ctx) {
  let n = 0;
  for (const o of ctx.enemies) {
    if (!o.attuned) continue;
    o.attuned = 0;
    o.group.scale.setScalar(1);
    n++;
    if (ctx.effects) ctx.effects.beam(e.pos, o.pos, 0x5bd0ff);
  }
  if (n && ctx.effects) {
    _sapAt.set(e.pos.x, 1.4, e.pos.z);
    ctx.effects.burst(_sapAt, 0x9ee8ff, 22, 6, 2.4, 0.7);
  }
}

// THE COMET. The shrike's four-state loop - circle, mark, dive, climb - with
// the whole theme on top of it: every dive it lands quickens the pace of the
// next and shortens the wait for it, so the enemy's second half is a much
// busier one than its first. The climb is the bill, and it never gets shorter.
export function aiComet(e, a) {
  const ctx = a.ctx;
  if (e.coState === undefined) {
    e.coState = 'circle';
    e.coT = 1 + Math.random() * 1.6;
    e.coTx = 0;
    e.coTz = 0;
    e.coPace = 0;
    e.coFall = 0;
  }
  const pace = 1 + e.coPace;
  // THE SEAM IS THE READOUT, on a flier too: brighter as the passes land.
  if (e.seamMesh) {
    const k = e.coPace / COMET_PACE_CAP;
    e.seamMesh.scale.setScalar((0.7 + k * 0.9) * e.scale);
  }

  if (e.coState === 'circle') {
    orbit(e, a, ENEMY_TYPES.comet.orbit);
    e.hoverY = COMET_HIGH;
    e.flyRate = FLY_RATE_DEFAULT;
    e.stepMul = 1.4;
    e.coT -= a.dt;
    if (e.coT <= 0 && a.dist < 18) {
      e.coState = 'mark';
      e.coT = COMET_WINDUP;
      e._setEyeAlert(true);
    }
    return;
  }

  if (e.coState === 'mark') {
    // Rears up and drifts in - the shrike's tell, and the whole counterplay
    // lives in the beat the player is given here.
    e.hoverY = COMET_HIGH + 1.0;
    e.flyRate = 5;
    a.vx = a.nx * a.sp * 0.5;
    a.vz = a.nz * a.sp * 0.5;
    e.coT -= a.dt;
    if (e.coT <= 0) {
      // LOCKED TO THE GROUND, not to the player - the contract every
      // telegraph in this game keeps.
      e.coTx = ctx.player.pos.x;
      e.coTz = ctx.player.pos.z;
      e.coState = 'dive';
      e.coT = COMET_DIVE_TIME;
      _blinkAt.set(e.coTx, 0.06, e.coTz);
      ctx.effects.shockwave(_blinkAt, ENEMY_TYPES.comet.eye, 2.4, 0.5);
    }
    return;
  }

  if (e.coState === 'dive') {
    e.hoverY = 0.9;
    e.flyRate = 11;
    e.stepMul = 2.9 * pace;
    const dx = e.coTx - e.pos.x;
    const dz = e.coTz - e.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    a.vx = (dx / d) * a.sp * 2.9 * pace;
    a.vz = (dz / d) * a.sp * 2.9 * pace;
    e.coT -= a.dt;
    const dy = Math.abs(ctx.player.pos.y - e.pos.y);
    if (a.dist < COMET_HIT_RANGE && dy < MELEE_REACH_Y) {
      // Through landHit, so a dive connects the way every contact in the
      // game does - the shrike's contract, one function for both paths.
      landHit(e, ctx);
      _blinkAt.set(e.pos.x, e.pos.y, e.pos.z);
      ctx.effects.burst(_blinkAt, ENEMY_TYPES.comet.eye, 14, 5, 2, 0.4);
      ctx.effects.addShake(0.12);
      // ACCRUED ON THE HIT: a landed pass is one that connected, and the
      // next is faster for it.
      e.coPace = Math.min(COMET_PACE_CAP, e.coPace + COMET_PACE_GAIN);
      e.coFall = Math.min(COMET_FALL_CAP, e.coFall + COMET_FALL_GAIN);
      _cometClimb(e);
      return;
    }
    if (e.coT <= 0 || (d < 0.9 && e.pos.y < 1.4)) {
      _blinkAt.set(e.pos.x, 0.1, e.pos.z);
      ctx.effects.burst(_blinkAt, 0xbfd0ff, 8, 3, 1.4, 0.4);
      // Accrued on the miss too, at half rate: a comet that missed is still
      // a comet that rang, and the loop is a clock whether or not it is
      // landing. Half, because the hit is the one the enemy is being paid
      // for.
      e.coFall = Math.min(COMET_FALL_CAP, e.coFall + COMET_FALL_GAIN * 0.5);
      _cometClimb(e);
    }
    return;
  }

  // CLIMB. The bill for a dive, hit or missed: a second and a half at half
  // speed, going up in a straight line away from the player. This is the
  // shot the player is meant to take, and it is why the comet is allowed to
  // be untouchable for the rest of its loop.
  e.hoverY = COMET_HIGH;
  e.flyRate = 2;
  e.stepMul = 1.4;
  a.vx = -a.nx * a.sp * 0.5;
  a.vz = -a.nz * a.sp * 0.5;
  e.coT -= a.dt;
  if (e.coT <= 0) {
    e.coState = 'circle';
    // THE WAIT SHORTENS with every pass, capped - the second half of its
    // life is a busier enemy, and never an unreadable one.
    e.coT = (0.7 + Math.random() * 0.9) * (1 - e.coFall);
    e._setEyeAlert(false);
  }
}

function _cometClimb(e) {
  e.coState = 'climb';
  e.coT = COMET_CLIMB_TIME;
  e.stepMul = 1.4;
  e._setEyeAlert(false);
}

// ---- the boss ----------------------------------------------------------------

// One fired peal: a ring of spokes, `off` rotating the whole volley - the
// echo volley fires half a step on, so its spokes sit in the first ring's
// gaps and the wall closes exactly where the eye just found the hole.
function _carillonPealFire(e, ctx, n, off) {
  const y = 1.4 * (e.group.scale.y || 1);
  for (let i = 0; i < n; i++) {
    ctx.addProjectile(e.pos.x, y, e.pos.z, 'carillon', 1, off + (i / n) * Math.PI * 2);
  }
  _bossAt.set(e.pos.x, y, e.pos.z);
  ctx.effects.burst(_bossAt, 0x9ee8ff, 18, 6, 1.5, 0.4);
  if (ctx.sfx) ctx.sfx.tone({ f: 587, f2: 880, t: 0.22, type: 'sine', v: 0.32 });
}

// The ring a committed body lands in: one shockwave, one falloff hit out to
// `r`, and the ground it struck setting as spreading crystal - where the
// tower has been, the floor keeps ringing. Shared by the GLISS's arrival and
// the BOUND's landing, which are the same arrival at two different speeds.
function _carillonSlam(e, a, r, cap, patchR, patchLife) {
  const ctx = a.ctx;
  _bossAt.set(e.pos.x, 0, e.pos.z);
  ctx.effects.shockwave(_bossAt, 0x5bd0ff, r + 0.9, 0.4);
  ctx.effects.burst(_bossAt, 0x9ee8ff, 26, 7, 2.5, 0.6);
  ctx.effects.addShake(0.24);
  if (ctx.sfx) ctx.sfx.impact();
  if (a.dist < r && _reachY(a) < BOSS_REACH_Y) {
    ctx.onHitPlayer(Math.min(cap, e.damage * 0.85), e.pos, e);
  }
  ctx.addHazard(e.pos.x, e.pos.z, patchR, patchLife, TOLL_DPS, 'crystal');
}

// Back to the walk after a committed attack. CAR_NEXT is the tempo of the
// whole fight: just long enough to breathe, never long enough to settle.
function _carillonDone(bs, e) {
  bs.state = 'walk';
  bs.atkCd = (bs.risingAt ? 0.75 : CAR_NEXT) * e.rate;
}

// The next ringing post: a loose circle of standpoints held at reading range
// of the player, the bearing ADVANCING with every pick, so over a fight the
// tower walks the arena instead of holding its old corner.
function _carillonPost(e, a) {
  const bs = e.bs;
  const p = a.ctx.player;
  bs.postAng += 0.9 + Math.random() * 0.8;
  for (let i = 0; i < 8; i++) {
    const ang = bs.postAng + (i - 3.5) * 0.5;
    const r = CAR_POST_MIN + Math.random() * (CAR_POST_MAX - CAR_POST_MIN);
    const x = p.pos.x + Math.cos(ang) * r;
    const z = p.pos.z + Math.sin(ang) * r;
    if (Math.abs(x) > 18.5 || Math.abs(z) > 18.5) continue;
    _sapAt.set(x, 0.4, z);
    if (a.ctx.obstacles && _obstacleAt(_sapAt, a.ctx.obstacles)) continue;
    bs.postX = x;
    bs.postZ = z;
    bs.postT = CAR_POST_T;
    return;
  }
  // Every candidate failed - hold this one for less long and ask again.
  bs.postT = CAR_POST_T * 0.5;
}

// Walk toward the current post, at `mul` of the tower's pace. The shared
// steering of every state that is free to move.
function _carillonSteer(e, a, mul) {
  const bs = e.bs;
  const dx = bs.postX - e.pos.x;
  const dz = bs.postZ - e.pos.z;
  const d = Math.hypot(dx, dz);
  if (d < 1.2) { a.vx = 0; a.vz = 0; return; }
  a.vx = (dx / d) * a.sp * mul;
  a.vz = (dz / d) * a.sp * mul;
}

// Enter one of the rotation's attacks. A mark the pool cannot give means the
// attack is CALLED OFF, not run blind - a warning that failed to draw is the
// one thing a telegraphed attack must never become.
function _carillonStart(e, a, key) {
  const bs = e.bs;
  const ctx = a.ctx;
  bs.el = 0;
  if (key === 'gliss') {
    const m = ctx.effects.markAcquire();
    if (m < 0) { bs.atkCd = CAR_GAP; return; }
    bs.mark = m;
    snapAim(e, a, true);
    bs.dirX = e.nx;
    bs.dirZ = e.nz;
    bs.state = 'glissTell';
    bs.t = GLISS_TELL;
    e.flash = 0.15;
    if (ctx.sfx) ctx.sfx.tone({ f: 196, f2: 392, t: GLISS_TELL, type: 'sine', v: 0.4 });
    return;
  }
  if (key === 'echo') {
    bs.state = 'echo';
    bs.t = ECHO_TELL;
    bs.echoI = 0;
    bs.echoDoneAt = ECHO_TELL + ECHO_FUSE + 0.3;
    e.flash = 0.15;
    if (ctx.sfx) ctx.sfx.tone({ f: 262, t: 0.3, type: 'sine', v: 0.3 });
    return;
  }
  if (key === 'cascade') {
    bs.state = 'cascade';
    bs.t = CASCADE_TELL;
    bs.cascN = CASCADE_N;
    bs.pourT = 0;
    snapAim(e, a, true);
    e.flash = 0.15;
    if (ctx.sfx) ctx.sfx.tone({ f: 880, t: 0.18, type: 'sine', v: 0.28 });
    return;
  }
  if (key === 'bound') {
    // The landing is marked AROUND THE PLAYER, not on them: the step
    // relocates the fight to a new post in their orbit rather than dropping
    // the tower on their head - that is what the gliss is for.
    const p = ctx.player;
    const baseAng = Math.atan2(e.pos.z - p.pos.z, e.pos.x - p.pos.x);
    for (let i = 0; i < 8; i++) {
      const ang = baseAng + Math.PI * (0.35 + (i >> 1) * 0.29) * (i % 2 ? 1 : -1);
      const r = BOUND_RING + (i % 3) - 1;
      const x = p.pos.x + Math.cos(ang) * r;
      const z = p.pos.z + Math.sin(ang) * r;
      const d = Math.hypot(x - e.pos.x, z - e.pos.z);
      if (d < BOUND_MIN || d > BOUND_MAX) continue;
      if (Math.abs(x) > 18.5 || Math.abs(z) > 18.5) continue;
      _sapAt.set(x, 0.4, z);
      if (ctx.obstacles && _obstacleAt(_sapAt, ctx.obstacles)) continue;
      const m = ctx.effects.markAcquire();
      if (m < 0) break;
      bs.mark = m;
      bs.destX = x;
      bs.destZ = z;
      bs.state = 'boundTell';
      bs.t = BOUND_TELL;
      bs.boundDur = d / BOUND_SPEED;
      e.flash = 0.15;
      if (ctx.sfx) ctx.sfx.tone({ f: 330, f2: 440, t: BOUND_TELL, type: 'sine', v: 0.3 });
      return;
    }
    bs.atkCd = CAR_GAP;
    return;
  }
  // toll
  bs.state = 'toll';
  bs.t = TOLL_TELL;
  e.flash = 0.18;
}

// The rotation's pick: the first ready attack, walking on from the last one
// fired so nothing repeats twice in a row, each with a gate on WHERE the
// player is so the attack it throws is never the wrong question. If nothing
// is ready the tower simply keeps walking - for half a second.
function _carillonPick(e, a) {
  const bs = e.bs;
  for (let k = 0; k < CAR_ROT.length; k++) {
    const key = CAR_ROT[(bs.rotI + k) % CAR_ROT.length];
    if (bs[key + 'Cd'] > 0) continue;
    if (key === 'gliss' && (a.dist < 6.5 || a.dist > 25)) continue;
    if (key === 'cascade' && (a.dist < 4 || a.dist > 26)) continue;
    if (key === 'toll' && a.dist <= 4.5) continue;
    bs.rotI = (bs.rotI + k + 1) % CAR_ROT.length;
    _carillonStart(e, a, key);
    return;
  }
  bs.atkCd = CAR_GAP;
}

// THE BELLS, driven every frame by whatever the fight is doing. The tower
// WEARS its accrual: the bells stand taller and turn faster for every notch
// of resonance on them, so the count to the full ring is read off the boss
// and not out of anybody's imagination. Three flags are the whole vocabulary
// the states get: flare (a volley leaving), seq (one bell rung of three),
// duck (the crouch before a bound, or the spent droop after a slam).
function _carillonBells(e, a) {
  const bs = e.bs;
  const rising = !!bs.risingAt;
  const resK = Math.min(1, bs.resonance / RES_CAP);
  const spin = 1 + resK * 0.9 + (rising ? 0.4 : 0);
  for (let i = 0; i < bs.bells.length; i++) {
    const b = bs.bells[i];
    b.rotation.y += a.dt * (0.6 + i * 0.25) * spin;
    let s = 0.9 + resK * 0.35 + (rising ? 0.2 : 0);
    if (bs.bellFlare > 0) s = 1.5 + i * 0.1;
    // The echo rings bottom bell to top; bs.bellSeq counts the SAMPLES.
    if (bs.bellSeq >= 0) s = i === 2 - bs.bellSeq ? 1.75 : 0.85;
    if (bs.bellDuck > 0) s *= 1 - bs.bellDuck * 0.32;
    b.scale.setScalar(Math.max(0.4, s) * e.scale);
    // THE BELLS SWING, the tower itself does not - rotation.z on the group is
    // the dance's own channel and would be overwritten by the weight shift
    // every frame.
    b.rotation.z = Math.sin(a.ctx.time * 1.4) * 0.3 * (1 - i * 0.25);
  }
  // And the hands play what the bells say: raised for a volley, spread for
  // the echo, pulled in for the crouch.
  if (bs.arms) {
    const spread = 0.3 + bs.bellFlare * 0.45 + (bs.bellSeq >= 0 ? 0.5 : 0) - bs.bellDuck * 0.2;
    bs.arms[0].rotation.z = spread;
    bs.arms[1].rotation.z = -spread;
  }
}

export function aiCarillon(e, a) {
  const bs = e.bs;
  const ctx = a.ctx;
  if (bs.state === undefined) {
    bs.state = 'walk';
    bs.fx = ctx.effects;
    bs.mark = -1;
    bs.rings = [];
    bs.pealN = PEAL_N;
    bs.pealCd = 1.8;
    bs.pealTell = 0;
    bs.pealEcho = 0;
    bs.pealEchoN = 0;
    bs.resonance = 0;
    bs.risingAt = false;
    bs.atkCd = 2.4;
    bs.rotI = 0;
    bs.tollCd = 4.5;
    bs.glissCd = 2;
    bs.cascadeCd = 3;
    bs.boundCd = 5;
    bs.echoCd = 6.5;
    bs.postAng = Math.random() * Math.PI * 2;
    bs.postX = e.pos.x;
    bs.postZ = e.pos.z;
    bs.postT = 0;
    bs.t = 0;
    bs.el = 0;
    bs.dirX = 0;
    bs.dirZ = 1;
    bs.destX = e.pos.x;
    bs.destZ = e.pos.z;
    bs.boundDur = 0;
    bs.cascN = 0;
    bs.pourT = 0;
    bs.echoI = 0;
    bs.echoDoneAt = 0;
    bs.dashHit = false;
    bs.dashTrail = 0;
    bs.bellFlare = 0;
    bs.bellSeq = -1;
    bs.bellDuck = 0;
  }
  bs.fx = ctx.effects;
  const p = ctx.player;
  const feared = e.status.fear > 0;
  const rising = !!bs.risingAt;

  // Standing on it costs, in EVERY state but the dash - which lands its own,
  // much larger, hit and must not also bill for the body arriving in it. The
  // tower is always live, and hugging it is never the fight.
  if (bs.state !== 'dash') bossTouch(e, a);

  // ---- the rising (one way, once, kept) -------------------------------------
  // Under a third of the bar the caps come OFF: the peal doubles up, the
  // resonance cap drops, the tower quickens. The fight should get louder as
  // it ends, not quieter - the whole theme's argument, arrived at by the boss.
  if (!bs.risingAt && e.hp <= e.maxHp * RISING_FRAC) {
    bs.risingAt = true;
    e.rate *= 0.78;
    e.speed *= 1.18;
    e.bodyMat.emissiveIntensity = 0.8;
    ctx.bossEvent('enrage', e);
    _bossAt.set(e.pos.x, 1.8, e.pos.z);
    ctx.effects.burst(_bossAt, 0x9ee8ff, 40, 8, 3, 0.9);
    ctx.effects.addShake(0.35);
    if (ctx.sfx) ctx.sfx.tone({ f: 220, f2: 440, t: 0.7, type: 'sine', v: 0.5 });
  }

  // The bells' state flags are this frame's slate: the peal clock and the
  // state machine both write them, and the drive at the bottom reads once.
  bs.bellFlare = 0;
  bs.bellSeq = -1;
  bs.bellDuck = 0;

  // ---- the peal: the fight's metronome --------------------------------------
  // Its OWN clock, independent of the rotation, and it fires ON THE MOVE -
  // the tower does not stop to ring. One round wider every volley, and on a
  // cooldown that shortens as the bar falls, exactly as it always did; what
  // changed is that it is no longer the only voice.
  if (bs.pealEcho > 0) {
    bs.pealEcho -= a.dt;
    if (bs.pealEcho <= 0) _carillonPealFire(e, ctx, bs.pealEchoN, Math.PI / bs.pealEchoN);
  }
  if (bs.pealTell > 0) {
    bs.pealTell -= a.dt;
    bs.bellFlare = 1;
    if (bs.pealTell <= 0) {
      const n = Math.min(PEAL_N_CAP, bs.pealN);
      _carillonPealFire(e, ctx, n, 0);
      bs.pealN += PEAL_N_GAIN;
      bs.resonance++;
      bs.pealCd = Math.max(1.0, (rising ? PEAL_CD * 0.6 : PEAL_CD) * e.rate
        - Math.min(1.4, (1 - e.hp / e.maxHp) * 1.4));
      // The DOUBLE peal - the second ring half a step on - is the tower
      // saying what is coming: always under the rising, and on the last notch
      // before the full ring, so the nova never arrives cold.
      if (rising || bs.resonance >= RES_CAP - 1) {
        bs.pealEcho = PEAL_ECHO_T;
        bs.pealEchoN = n;
      }
      if (bs.state === 'walk' || bs.state === 'toll') e._setEyeAlert(false);
    }
  } else {
    bs.pealCd -= a.dt;
    // Suppressed where its bell-flare would muddy a bigger tell - the dash,
    // the nova and the recover are the tower's own loudest beats.
    const quiet = bs.state === 'glissTell' || bs.state === 'dash'
      || bs.state === 'fullring' || bs.state === 'recover';
    if (bs.pealCd <= 0 && !quiet && a.dist < 28) {
      bs.pealTell = PEAL_TELL;
      e.flash = 0.15;
      e._setEyeAlert(true);
      if (ctx.sfx) ctx.sfx.tone({ f: 660, f2: 990, t: 0.24, type: 'sine', v: 0.22 });
    }
  }

  // The rotation's clocks tick in EVERY state, so a long tell never delays
  // what comes after it.
  bs.tollCd -= a.dt;
  bs.glissCd -= a.dt;
  bs.cascadeCd -= a.dt;
  bs.boundCd -= a.dt;
  bs.echoCd -= a.dt;

  switch (bs.state) {

    // ---- the gliss: the tell, then the run -------------------------------
    case 'glissTell': {
      a.vx = 0;
      a.vz = 0;
      e._setEyeAlert(true);
      faceSnap(e);
      bs.t -= a.dt;
      bs.el += a.dt;
      // THE LANE, full length from the first frame so the AREA reads
      // instantly and fills so the TIMING reads as it goes.
      ctx.effects.markSet(bs.mark,
        e.pos.x + bs.dirX * GLISS_LEN * 0.5, e.pos.z + bs.dirZ * GLISS_LEN * 0.5,
        GLISS_HALF, 0x9ee8ff, Math.min(1, bs.el / GLISS_TELL),
        GLISS_LEN / (GLISS_HALF * 2), Math.atan2(-bs.dirX, -bs.dirZ));
      if (bs.t > 0) break;
      ctx.effects.markRelease(bs.mark);
      bs.mark = -1;
      bs.state = 'dash';
      bs.t = GLISS_TIME;
      bs.dashHit = false;
      bs.dashTrail = 0;
      e._setEyeAlert(false);
      ctx.bossEvent('charge', e);
      _bossAt.set(e.pos.x, 1.4, e.pos.z);
      ctx.effects.burst(_bossAt, 0x9ee8ff, 20, 6, 2, 0.5);
      ctx.effects.addShake(0.16);
      if (ctx.sfx) ctx.sfx.tone({ f: 392, f2: 98, t: 0.5, type: 'sine', v: 0.5 });
      break;
    }

    case 'dash': {
      bs.t -= a.dt;
      // THE STEP CLAMP HAS TO BE LIFTED, as on every charger: update() caps
      // the frame's movement at sp*stepMul, and the tower walks at three. Set
      // each frame, so a slow landing mid-run cannot quietly halve it.
      e.stepMul = GLISS_SPEED / Math.max(0.5, a.sp);
      a.vx = bs.dirX * GLISS_SPEED;
      a.vz = bs.dirZ * GLISS_SPEED;
      faceSnap(e);
      bs.dashTrail -= a.dt;
      if (bs.dashTrail <= 0) {
        bs.dashTrail = 0.05;
        _sapAt.set(e.pos.x, 0.6, e.pos.z);
        ctx.effects.burst(_sapAt, 0x5bd0ff, 3, 2.4, 0.6, 0.3);
      }
      // Caught on the lane: the tower itself is the hit, and it rings where
      // it caught you.
      if (!bs.dashHit && a.dist < e.radius + 1.0 && _reachY(a) < BOSS_REACH_Y) {
        bs.dashHit = true;
        ctx.onHitPlayer(Math.min(GLISS_CAP, e.damage), e.pos, e);
        ctx.effects.addShake(0.26);
        _carillonSlam(e, a, SLAM_R, SLAM_CAP, SLAM_PATCH_R, SLAM_PATCH_LIFE);
        bs.resonance++;
        bs.glissCd = GLISS_CD * e.rate * (rising ? 0.7 : 1);
        bs.state = 'recover';
        bs.t = 0.55;
        break;
      }
      if (bs.t <= 0 || e.blockedBy > 0.05) {
        // The lane is spent - on its mark, or on whatever stood in the way.
        // A stopped run is the LONGER beat: that is the player's window, and
        // it is the bait the lane was there to be.
        _carillonSlam(e, a, SLAM_R, SLAM_CAP, SLAM_PATCH_R, SLAM_PATCH_LIFE);
        bs.resonance++;
        bs.glissCd = GLISS_CD * e.rate * (rising ? 0.7 : 1);
        bs.state = 'recover';
        bs.t = e.blockedBy > 0.05 ? 0.95 : 0.55;
      }
      break;
    }

    case 'recover': {
      // The beat after a committed lane: bells droop, nothing attacks. Short
      // enough that it is a breath, not a pause - the whole point of the
      // rebuild is that the breathing ROOM is small.
      e.stepMul = 1.4;
      a.vx = 0;
      a.vz = 0;
      bs.bellDuck = 0.8;
      bs.t -= a.dt;
      if (bs.t <= 0) _carillonDone(bs, e);
      break;
    }

    // ---- the echo: their own footsteps, rung back ---------------------------
    case 'echo': {
      bs.el += a.dt;
      bs.t -= a.dt;
      // THE SAMPLES, three beats apart, each one the player's position of
      // that instant. A sample the mark pool cannot draw is DROPPED, never
      // rung blind: the echo you saw is the echo that lands.
      while (bs.echoI < 3 && bs.el >= 0.1 + bs.echoI * ECHO_STEP) {
        const i = bs.echoI++;
        const m = ctx.effects.markAcquire();
        if (m >= 0) {
          bs.rings.push({
            mark: m, x: p.pos.x, z: p.pos.z, r: ECHO_R,
            sampleAt: bs.el, ringAt: bs.el + ECHO_FUSE, fired: false,
          });
        }
        _bossAt.set(e.pos.x, e.pos.y + 4, e.pos.z);
        _sapAt.set(p.pos.x, 0.4, p.pos.z);
        ctx.effects.beam(_bossAt, _sapAt, 0x9ee8ff);
        ctx.effects.burst(_sapAt, 0x9ee8ff, 6, 2, 1, 0.3);
        if (ctx.sfx) ctx.sfx.tone({ f: 392 * Math.pow(1.26, i), t: 0.22, type: 'sine', v: 0.3 });
      }
      // Planted while it reads; free once the last sample is down - the
      // detonations belong to the floor by then, not to the tower.
      if (bs.t > 0) {
        a.vx = 0;
        a.vz = 0;
        e._setEyeAlert(true);
        bs.bellSeq = Math.max(0, bs.echoI - 1);
      } else {
        e._setEyeAlert(false);
        _carillonSteer(e, a, 0.6);
      }
      let ringing = false;
      for (let i = 0; i < bs.rings.length; i++) {
        const R = bs.rings[i];
        if (R.fired) continue;
        ringing = true;
        ctx.effects.markSet(R.mark, R.x, R.z, R.r, 0x9ee8ff,
          Math.min(1, (bs.el - R.sampleAt) / (R.ringAt - R.sampleAt)));
        if (bs.el < R.ringAt) continue;
        R.fired = true;
        ctx.effects.markRelease(R.mark);
        _sapAt.set(R.x, 0, R.z);
        ctx.effects.shockwave(_sapAt, 0x5bd0ff, R.r + 0.6, 0.35);
        ctx.effects.burst(_sapAt, 0x9ee8ff, 20, 6, 2.2, 0.5);
        ctx.effects.addShake(0.14);
        if (ctx.sfx) ctx.sfx.tone({ f: 392 * Math.pow(1.26, i) * 0.5, t: 0.4, type: 'sine', v: 0.4 });
        const ddx = p.pos.x - R.x;
        const ddz = p.pos.z - R.z;
        if (Math.hypot(ddx, ddz) < R.r && Math.abs(p.pos.y) < 2.2) {
          ctx.onHitPlayer(Math.min(ECHO_CAP, e.damage), _sapAt, e);
        }
      }
      if (ringing || bs.el < bs.echoDoneAt) break;
      bs.rings.length = 0;
      bs.resonance++;
      bs.echoCd = ECHO_CD * e.rate * (rising ? 0.7 : 1);
      e._setEyeAlert(false);
      _carillonDone(bs, e);
      break;
    }


    // ---- the cascade: the rain that walks with them -------------------------
    case 'cascade': {
      bs.el += a.dt;
      if (bs.t > 0) {
        bs.t -= a.dt;
        a.vx = 0;
        a.vz = 0;
        e._setEyeAlert(true);
        faceSnap(e);
        if (bs.t <= 0) e._setEyeAlert(false);
        break;
      }
      // POURING - and the tower keeps WALKING while it pours. The rain is one
      // of the two answers the fight gives to "it used to stand still".
      _carillonSteer(e, a, 0.55);
      bs.pourT -= a.dt;
      if (bs.cascN > 0 && bs.pourT <= 0) {
        bs.pourT = CASCADE_STEP;
        bs.cascN--;
        // THE LEAD, re-read at every pour: it chases where the player IS
        // GOING, not where they were. The circles are the game's own mortar
        // warning - the red fill IS the contract - so the cascade does not
        // dress them up in the theme's own colour.
        const lead = CASCADE_LEAD + (CASCADE_N - bs.cascN) * 0.04;
        const tx = Math.max(-ARENA_HALF + 2, Math.min(ARENA_HALF - 2, p.pos.x + p.vel.x * lead));
        const tz = Math.max(-ARENA_HALF + 2, Math.min(ARENA_HALF - 2, p.pos.z + p.vel.z * lead));
        ctx.addMortar(tx, tz, CASCADE_R, CASCADE_DELAY, CASCADE_DMG);
        _bossAt.set(e.pos.x, e.pos.y + 4, e.pos.z);
        _sapAt.set(tx, 0.4, tz);
        ctx.effects.beam(_bossAt, _sapAt, 0x9ee8ff);
        if (ctx.sfx) ctx.sfx.tone({ f: 660 * Math.pow(0.94, CASCADE_N - bs.cascN), t: 0.16, type: 'sine', v: 0.24 });
      }
      if (bs.cascN > 0 || bs.pourT > 0) break;
      bs.resonance++;
      bs.cascadeCd = CASCADE_CD * e.rate * (rising ? 0.7 : 1);
      _carillonDone(bs, e);
      break;
    }


    // ---- the bound: the step across the room -------------------------------
    case 'boundTell': {
      a.vx = 0;
      a.vz = 0;
      e._setEyeAlert(true);
      bs.t -= a.dt;
      bs.el += a.dt;
      bs.bellDuck = Math.min(1, bs.el / BOUND_TELL);
      // The landing circle fills across tell AND flight alike, so the clock
      // the player reads is the whole of it, not a beat of it.
      ctx.effects.markSet(bs.mark, bs.destX, bs.destZ, BOUND_SLAM_R, 0x9ee8ff,
        Math.min(1, bs.el / (BOUND_TELL + bs.boundDur)) * 0.85);
      if (bs.t > 0) break;
      bs.state = 'bound';
      bs.t = bs.boundDur * 1.6 + 0.6;
      bs.dashTrail = 0;
      e._setEyeAlert(false);
      if (ctx.sfx) ctx.sfx.tone({ f: 220, f2: 440, t: 0.4, type: 'sine', v: 0.4 });
      break;
    }

    case 'bound': {
      bs.t -= a.dt;
      bs.el += a.dt;
      const dx = bs.destX - e.pos.x;
      const dz = bs.destZ - e.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      e.stepMul = BOUND_SPEED / Math.max(0.5, a.sp);
      a.vx = (dx / d) * BOUND_SPEED;
      a.vz = (dz / d) * BOUND_SPEED;
      // It faces the TRAVEL here, like a thing thrown - the one state where
      // the tower looks where it is going instead of at you.
      e.nx = dx / d;
      e.nz = dz / d;
      faceSnap(e);
      bs.bellFlare = 1;
      ctx.effects.markSet(bs.mark, bs.destX, bs.destZ, BOUND_SLAM_R, 0x9ee8ff,
        Math.min(1, bs.el / (BOUND_TELL + bs.boundDur)));
      bs.dashTrail -= a.dt;
      if (bs.dashTrail <= 0) {
        bs.dashTrail = 0.06;
        _sapAt.set(e.pos.x, 0.5, e.pos.z);
        ctx.effects.burst(_sapAt, 0x5bd0ff, 3, 2, 0.6, 0.3);
      }
      if (d > 1.1 && bs.t > 0 && e.blockedBy <= 0.05) break;
      // LANDING. Wherever it actually stopped - the marked circle, or the
      // cover that said no - the ring lands there, honest to the last frame.
      a.vx = 0;
      a.vz = 0;
      ctx.effects.markRelease(bs.mark);
      bs.mark = -1;
      _carillonSlam(e, a, BOUND_SLAM_R, BOUND_CAP, BOUND_PATCH_R, BOUND_PATCH_LIFE);
      bs.resonance++;
      bs.boundCd = BOUND_CD * e.rate * (rising ? 0.7 : 1);
      bs.state = 'recover';
      bs.t = 0.6;
      break;
    }


    // ---- the toll (kept): the claim on the floor where it stands ----------
    case 'toll': {
      a.vx = 0;
      a.vz = 0;
      e._setEyeAlert(true);
      bs.t -= a.dt;
      _sapAt.set(e.pos.x, 0.12, e.pos.z);
      ctx.effects.shockwave(_sapAt, 0x5bd0ff, TOLL_R, 0.16);
      if (bs.t > 0) break;
      e._setEyeAlert(false);
      bs.tollCd = (rising ? 5.5 : TOLL_CD) * e.rate;
      const off = Math.random() * Math.PI * 2;
      // A GAP IN THE RING, rotated at random - the broodmother's rule: a
      // closed ring with the player outside it would be a wall with no side
      // to pick, and the gap is what makes the ring a question.
      const gapAt = (Math.random() * TOLL_N) | 0;
      for (let i = 0; i < TOLL_N; i++) {
        if (i === gapAt || i === (gapAt + 1) % TOLL_N) continue;
        const ang = off + (i / TOLL_N) * Math.PI * 2;
        ctx.addHazard(
          e.pos.x + Math.cos(ang) * TOLL_R,
          e.pos.z + Math.sin(ang) * TOLL_R,
          TOLL_PATCH_R, TOLL_LIFE, TOLL_DPS, 'crystal'
        );
      }
      _sapAt.set(e.pos.x, 0.1, e.pos.z);
      ctx.effects.shockwave(_sapAt, 0x5bd0ff, TOLL_R + 2, 0.4);
      ctx.effects.addShake(0.2);
      if (ctx.sfx) ctx.sfx.impact();
      bs.resonance++;
      _carillonDone(bs, e);
      break;
    }

    // ---- the full ring: the accrual's bill ----------------------------------
    case 'fullring': {
      a.vx = 0;
      a.vz = 0;
      e._setEyeAlert(true);
      bs.t -= a.dt;
      bs.el += a.dt;
      const k = Math.min(1, bs.el / FULL_TELL);
      bs.bellFlare = 1;
      // THE TOLL OF TOLLS, drawn at its full nine metres - with the fill
      // pulled back by `weight`, because a disc that big at full strength is
      // a wash over half the fight, and the EDGE is the message.
      ctx.effects.markSet(bs.mark, e.pos.x, e.pos.z, FULL_R, 0x9ee8ff, k, 1, 0, 0.45);
      if (bs.t > 0) break;
      // RING EVERYTHING AT ONCE.
      ctx.effects.markRelease(bs.mark);
      bs.mark = -1;
      e._setEyeAlert(false);
      _bossAt.set(e.pos.x, 0, e.pos.z);
      ctx.effects.shockwave(_bossAt, 0x5bd0ff, FULL_R + 1, 0.5);
      ctx.effects.burst(_bossAt, 0x9ee8ff, 44, 9, 3, 0.9);
      ctx.effects.addShake(0.45);
      if (ctx.sfx) {
        ctx.sfx.wave();
        ctx.sfx.tone({ f: 131, f2: 65, t: 0.8, type: 'sine', v: 0.55 });
      }
      if (a.dist < FULL_R && _reachY(a) < BOSS_REACH_Y) {
        ctx.onHitPlayer(
          Math.min(FULL_CAP, e.damage * FULL_DMG_MUL) * (1 - 0.45 * a.dist / FULL_R),
          e.pos, e
        );
      }
      const n = Math.min(PEAL_N_CAP, bs.pealN) + FULL_SPOKES;
      const off = Math.random() * Math.PI * 2;
      const y = 1.4 * (e.group.scale.y || 1);
      for (let i = 0; i < n; i++) {
        ctx.addProjectile(e.pos.x, y, e.pos.z, 'carillon', 0.9, off + (i / n) * Math.PI * 2);
      }
      // ...and the ground it rang OVER sets as glass - the room the fight
      // started in is gone, which was the tower's argument from the start.
      for (let i = 0; i < FULL_PATCHES; i++) {
        const ang = off + (i / FULL_PATCHES) * Math.PI * 2 + 0.7;
        const x = e.pos.x + Math.cos(ang) * 5.2;
        const z = e.pos.z + Math.sin(ang) * 5.2;
        _sapAt.set(x, 0.4, z);
        if (ctx.obstacles && _obstacleAt(_sapAt, ctx.obstacles)) continue;
        ctx.addHazard(x, z, FULL_PATCH_R, FULL_PATCH_LIFE, TOLL_DPS, 'crystal');
      }
      bs.resonance = 0;
      _carillonDone(bs, e);
      break;
    }

    // ---- the walk: the rounds, and the pick ---------------------------------
    default: {
      e.stepMul = 1.4;
      if (!feared) {
        bs.atkCd -= a.dt;
        if (bs.atkCd <= 0) {
          // The accrual's bill comes FIRST, ahead of the whole rotation -
          // when the tower is wound full, the next thing it does is spend it.
          if (bs.resonance >= (rising ? RES_CAP_RISING : RES_CAP)) {
            const m = ctx.effects.markAcquire();
            if (m >= 0) {
              bs.mark = m;
              bs.state = 'fullring';
              bs.t = FULL_TELL;
              bs.el = 0;
              e.flash = 0.2;
              if (ctx.sfx) ctx.sfx.tone({ f: 131, f2: 262, t: FULL_TELL, type: 'sine', v: 0.45 });
            } else {
              bs.atkCd = CAR_GAP;
            }
            break;
          }
          _carillonPick(e, a);
        }
      }
      // A pick may have consumed the frame; the walk is only the walk.
      if (bs.state !== 'walk') break;
      bs.postT -= a.dt;
      const pdx = bs.postX - e.pos.x;
      const pdz = bs.postZ - e.pos.z;
      if (bs.postT <= 0 || Math.hypot(pdx, pdz) < 1.4) _carillonPost(e, a);
      _carillonSteer(e, a, 1);
      break;
    }
  }

  _carillonBells(e, a);
}

const TYPES = {
  // ---- SAPPHIRE -------------------------------------------------------------
  //
  // The theme of ACCRUING RESONANCE. Six enemies and a boss, every one of
  // them reading as one family through the lit seam of blue-white light each
  // carries in its cut-stone body - and every one of them worse for every
  // second it is allowed to keep existing.

  // A rusher that runs faster every beat it survives. The whole enemy is the
  // question of how long anything in the room has been alive: a dart killed
  // on sight is the cheapest thing in the theme, and a dart that reached you
  // at full ring is a rusher with a brute's pace.
  dart: {
    head: { r: 0.28, y: 1.0 },
    hp: 40, speed: 3.5, damage: 8, value: 190, color: 0x2a6f8f, eye: 0x9ee8ff,
    scale: 0.95, radius: 0.46, mass: 1,
    melee: { windup: 0.4, start: 1.4, hit: 2.0, cd: 1.0 },
    build: buildDart, ai: aiDart,
  },

  // A gunner whose fan is one round wider every volley. The first shot is a
  // single dart to step off; the fifth is a wall with a gap in it somewhere -
  // and the answer is the theme's answer, which is to have already killed it.
  facet: {
    head: { r: 0.28, y: 1.3 },
    hp: 26, speed: 2.3, damage: 9, value: 230, color: 0x1f6e94, eye: 0x9ee8ff,
    scale: 1.0, radius: 0.48, mass: 1,
    orbit: { dist: 12, band: 2.5, out: 0.8, in: -0.65, strafe: 0.45, flip: 1.8, flipVar: 2 },
    proj: {
      core: 0x9ee8ff, glow: 0x5bd0ff, scale: 0.6,
      speed: [17, 0.3, 25], dmg: [7, 0.35, 13],
    },
    build: buildFacet, ai: aiFacet,
  },

  // A brute that grows a shell out of what it has already been hit with. Each
  // landed blow settles as plate, normalised against the cairn's own bar, so
  // the cairn you broke on sight is a soft target and the cairn you ignored
  // for ten seconds is a wall. Burn and venom ignore the shell entirely, the
  // patient answer to armour made of impatience.
  cairn: {
    head: { r: 0.3, y: 1.72 },
    hp: 150, speed: 1.5, damage: 16, value: 300, color: 0x274e66, eye: 0x9ee8ff,
    scale: 1.4, radius: 0.6, mass: 2,
    melee: { windup: 0.75, start: 2.8, hit: 3.4, cd: 2.4 },
    // STATE, NOT FACING - so armorDefault is a function, the pale crown's
    // rule: a constant would have the shell halving poison and blasts long
    // after the player stopped feeding it, and directionless damage falls to
    // 1 by design.
    armor: cairnArmor,
    armorDefault: () => 1,
    build: buildCairn, ai: aiCairn,
  },

  // The only artillery in the game whose patch ARRIVES SMALL AND GROWS: the
  // seed lands as a mortar at the FINAL radius, and the crystal then spreads
  // outward from where it came down for two more seconds. The circle the
  // player was shown is the ground the patch will reach - the whole enemy is
  // the difference between where the ring was drawn and where the edge ends
  // up.
  lapidary: {
    head: { r: 0.3, y: 0.86 },
    hp: 46, speed: 1.9, damage: 0, value: 290, color: 0x3a7d9c, eye: 0x9ee8ff,
    scale: 1.15, radius: 0.55, mass: 1,
    orbit: { dist: 13, band: 2.5, out: 0.75, in: -0.55, strafe: 0.3, flip: 2.4, flipVar: 2 },
    build: buildLapidary, ai: aiLapidary,
  },

  // No attack. It TUNES THE WAVE: everything inside its ring moves faster,
  // a stack at a time, capped - and the stacks come OFF when it dies, which
  // is the third support in the game and the one whose whole argument is the
  // theme's: the wave is ringing, and this is what is ringing it. The ring is
  // drawn on the floor at exactly the radius it works at, the halo's
  // contract.
  attuner: {
    head: { r: 0.28, y: 1.5 },
    hp: 62, speed: 2.1, damage: 0, value: 340, color: 0x2d6a85, eye: 0x9ee8ff,
    scale: 1.15, radius: 0.5, mass: 1,
    orbit: { dist: 12, band: 2, out: 0.8, in: -0.6, strafe: 0.3, flip: 2, flipVar: 2 },
    onDeath: attunerOnDeath,
    build: buildAttuner, ai: aiAttuner,
  },

  // A flier whose passes QUICKEN. The shrike's loop - circle, tell, dive,
  // climb - but every dive it lands makes the next faster and the wait for
  // it shorter, so the second half of its life is a much busier enemy than
  // the first. The climb after every pass is the shot, and it never gets
  // shorter.
  comet: {
    head: { r: 0.28, y: 1.04 },
    hp: 54, speed: 4.4, damage: 20, value: 300, color: 0x4f93b8, eye: 0xbfe6ff,
    scale: 1.15, radius: 0.45, mass: 1,
    hitbox: { r: 0.55, y: 1.0 },
    fly: { height: COMET_HIGH },
    orbit: { dist: 8, band: 2, out: 0.7, in: -0.7, strafe: 0.8, flip: 1.4, flipVar: 1.2 },
    build: buildComet, ai: aiComet,
  },

  // THE CARILLON. The theme's whole clock at fight scale, and CONSTANTLY IN
  // MOTION: it walks between ringing posts, throws itself down a lit lane
  // (the GLISS), rings the player's own last three steps back at them (the
  // ECHO), pours a chasing rain down their line of escape (the CASCADE),
  // crosses the room in one bound onto a marked circle (the BOUND), and still
  // lays the gapped crystal ring where it stands (the TOLL) - while the spoke
  // volley (the PEAL) widens on every fire, on its own clock. Everything it
  // finishes winds the RESONANCE one notch, worn on the bells, and at the cap
  // the FULL RING spends it all at once. Under a third of the bar the RISING
  // drops the caps. No melee block on purpose: it keeps its distance and
  // fights with the room, and bossTouch runs in EVERY state, so hugging the
  // tower is never the fight.
  carillon: {
    head: { r: 0.44, y: 1.72 },
    hp: 3400, speed: 2.9, damage: 26, value: 6000, color: 0x1d5d7a, eye: 0x9ee8ff,
    scale: 2.9, radius: 1.8, mass: 8, boss: true,
    hitbox: { r: 0.72, y: 0.8 },
    statusMul: 0.3, freezeSlow: true, slowFactor: 0.75, freezeVuln: 1.0,
    entropyExempt: true, fearMode: 'stagger',
    // The peal's spokes, in the theme's own blue and one size up from the
    // facet's fan - many in the air at once, so they are small and each is
    // cheap: a wall with no gap reads as unsurvivable, and the volley has to
    // cost real health when it catches the player in the open while staying
    // survivable when one round clips them on the way past.
    proj: {
      core: 0x9ee8ff, glow: 0x5bd0ff, scale: 0.6,
      speed: [13, 0.22, 19], dmg: [7, 0.3, 14],
    },
    build: buildCarillon, ai: aiCarillon, cleanup: releaseMarks,
  },
};

Object.assign(ENEMY_TYPES, TYPES);
