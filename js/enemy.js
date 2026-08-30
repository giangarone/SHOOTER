// Enemies and enemy projectiles.
//
// An Enemy owns a THREE.Group (its model) and a `pos` vector that is the
// source of truth for its location; the group follows pos each update. Like
// the player, pos is at floor level. Enemies never leave the ground plane -
// they slide around obstacles rather than climbing them.
//
// Behaviour by type:
//   chaser/splitter/tank  close to melee range, wind up, then hit
//   shooter/sniper        hold a preferred distance, strafe, fire projectiles
//   bomber                holds distance and lobs arcing grenades
// Splitters are ordinary enemies here; main.js is what spawns their children
// when one dies.
//
// MOVEMENT IS PATH-AWARE. `nx, nz` inside update() is the straight line to the
// player, and is what an enemy AIMS and ATTACKS along; `px, pz` is the heading
// it WALKS along, which comes from the shared navigation grid (nav.js) and
// bends around pillars and crates. Retreats - a feared enemy, a shooter
// backing off - reverse the straight line instead: running away has no
// destination to route to.
//
// LIFECYCLE: a killed enemy sets `dead` and main.js removes it from the scene
// and calls dispose(). Anything added to an enemy that allocates a GPU
// resource per instance must be freed there, or it leaks for the whole session.
//
// ctx passed to update() is built once per frame in main.js and carries the
// player, the live enemy list, obstacles, game time, and callbacks for
// damaging the player and spawning projectiles.

import * as THREE from 'three';
import { resolveCircle, pointInObstacle, AGENT_HEIGHT, BOSS_HEIGHT } from './utils.js';

// Base stats before per-wave scaling (waves.js supplies the multipliers).
//
// A TYPE IS A STAT BLOCK PLUS TWO FUNCTIONS. `build(e, group, s)` adds the
// parts that make it look like itself; `ai(e, a)` decides what it does with a
// frame. Both live on the entry rather than in a `type === ...` chain, the
// same shape WEAPONS.build() and UPGRADES.apply() already use: with fifteen
// types a chain is scanned top to bottom every frame and, worse, splits one
// enemy's definition across three distant parts of the file.
//
// A type with no `ai` is INERT - it stands still and never attacks. That is
// deliberate and load-bearing: `conduit` is a support unit with no attack of
// its own.
//
// FIELDS
//   scale       sizes the whole model and its hitbox. Baked into the cached
//               body geometry, so every instance of a type shares one value -
//               per-instance size has to come from group.scale (see main.js's
//               _splitInto).
//   radius      collision circle on the XZ plane. Independent of `scale`,
//               because the model may be much wider than the space it should
//               actually occupy.
//   mass        >= 4 means knockback, gravity and shockwaves cannot move it.
//   melee/orbit parameters for the two shared AI shapes below.
//
// Optional fields, all defaulting to the behaviour the original six types had
// before bosses existed - see the status block further down for what they do:
//   statusMul, freezeSlow, slowFactor, freezeVuln, entropyExempt, fearMode,
//   armor, armorDefault, boss, hitbox.
export const ENEMY_TYPES = {
  chaser: {
    hp: 42, speed: 3.4, damage: 12, score: 100, color: 0xff3b30, eye: 0xffe08a,
    scale: 1, radius: 0.5, mass: 1,
    melee: { windup: 0.45, start: 1.5, hit: 2.2, cd: 1.1 },
    build: buildChaser, ai: aiMelee,
  },
  shooter: {
    hp: 28, speed: 2.7, damage: 8, score: 150, color: 0xb14aed, eye: 0x4ef3ff,
    scale: 1.08, radius: 0.5, mass: 1,
    orbit: { dist: 7.5, band: 1.5, out: 1, in: -0.7, strafe: 0.5, flip: 1, flipVar: 2 },
    build: buildShooter, ai: aiShooter,
  },
  tank: {
    hp: 180, speed: 1.8, damage: 25, score: 300, color: 0xff6b00, eye: 0xffaa00,
    scale: 1.5, radius: 0.5, mass: 1,
    melee: { windup: 0.8, start: 3.5, hit: 4.0, cd: 3.0 },
    build: buildTank, ai: aiMelee,
  },
  sniper: {
    hp: 18, speed: 2.2, damage: 15, score: 200, color: 0x00ff88, eye: 0x88ffcc,
    scale: 0.9, radius: 0.5, mass: 1,
    orbit: { dist: 22, band: 2, out: 0.8, in: -0.5, strafe: 0.4, flip: 2, flipVar: 3 },
    build: buildSniper, ai: aiSniper,
  },
  splitter: {
    hp: 30, speed: 3.0, damage: 10, score: 120, color: 0xff00aa, eye: 0xff88dd,
    scale: 1.0, radius: 0.5, mass: 1,
    melee: { windup: 0.4, start: 1.4, hit: 2.0, cd: 1.0 },
    build: buildSplitter, ai: aiSplitter,
  },
  bomber: {
    hp: 35, speed: 2.0, damage: 18, score: 180, color: 0xff4400, eye: 0xff8844,
    scale: 1.1, radius: 0.5, mass: 1,
    orbit: { dist: 10, band: 2, out: 0.6, in: -0.3, strafe: 0.3, flip: 2.5, flipVar: 2 },
    build: buildBomber, ai: aiBomber,
  },

  // ---- the second roster -------------------------------------------------
  // Four types that ask for something the original six never did: watch your
  // back, get around it, shoot the right one first, and move.

  // Punishes tunnel vision. Fragile and fast, and it does not approach in a
  // straight line - it blinks past you and swings from behind, so a player
  // who has locked onto the crowd in front loses health to something they
  // never saw. Cheap in HP because it is meant to die the moment it is noticed.
  wraith: {
    hp: 26, speed: 4.2, damage: 11, score: 190, color: 0x6f5bff, eye: 0xd0c4ff,
    scale: 0.95, radius: 0.45, mass: 1,
    melee: { windup: 0.35, start: 1.4, hit: 2.0, cd: 0.9 },
    build: buildWraith, ai: aiWraith,
  },

  // Punishes standing still. A shield across its front, so shooting it head on
  // is a waste of a magazine and the answer is to move around it - or to burn
  // it, since armorDefault is 1 and damage over time ignores the shield
  // entirely. That is the intended counter, not an oversight: Venom and
  // Incendiary should have an enemy they are obviously right for.
  bulwark: {
    hp: 110, speed: 1.6, damage: 18, score: 280, color: 0x8d9db6, eye: 0xffd54f,
    scale: 1.35, radius: 0.62, mass: 2,
    melee: { windup: 0.7, start: 2.6, hit: 3.2, cd: 2.2 },
    // dx,dz is the direction the hit TRAVELLED; the enemy faces -sin/-cos of
    // its own yaw. A hit moving against that facing came from the front.
    armor: (e, dx, dz) => {
      const d = Math.hypot(dx, dz) || 1;
      const fx = -Math.sin(e.group.rotation.y);
      const fz = -Math.cos(e.group.rotation.y);
      return (dx / d) * fx + (dz / d) * fz < -0.34 ? 0.4 : 1;
    },
    armorDefault: 1,
    build: buildBulwark, ai: aiMelee,
  },

  // Punishes shooting whatever is closest. It has no attack at all - it makes
  // everything around it tougher and faster, and draws a line to each one so
  // the player can see exactly what killing it would undo.
  conduit: {
    hp: 55, speed: 2.2, damage: 0, score: 320, color: 0x00e5b0, eye: 0xa7ffe8,
    scale: 1.15, radius: 0.5, mass: 1,
    orbit: { dist: 12, band: 2, out: 0.8, in: -0.6, strafe: 0.35, flip: 2, flipVar: 2 },
    build: buildConduit, ai: aiConduit,
  },

  // Punishes holding one good spot. Lobs pools that make the floor where you
  // are standing cost health, so the answer is always to give up the position.
  // Does no direct damage: the ground it leaves behind is the whole threat.
  blight: {
    hp: 48, speed: 1.9, damage: 0, score: 240, color: 0x7ac943, eye: 0xd6ff8a,
    scale: 1.15, radius: 0.55, mass: 1,
    orbit: { dist: 12, band: 2, out: 0.7, in: -0.5, strafe: 0.3, flip: 2.5, flipVar: 2 },
    build: buildBlight, ai: aiBlight,
  },

  // Punishes running the same line the enemy is running. It walks toward the
  // player like a chaser and burns the floor behind it, so the ground it has
  // crossed stays dangerous for five seconds. Slower and weaker in melee than
  // a chaser, because the trail is where its threat actually lives - and the
  // trail is the reason to break off and take an angle rather than backpedal
  // in a straight line.
  magma: {
    hp: 52, speed: 2.7, damage: 9, score: 210, color: 0xff5a1f, eye: 0xffd166,
    scale: 1.05, radius: 0.52, mass: 1,
    melee: { windup: 0.5, start: 1.5, hit: 2.2, cd: 1.3 },
    build: buildMagma, ai: aiMagma,
  },

  // Punishes shooting into a crowd. It has no attack at all: it projects a
  // dome that makes every enemy standing in it UNKILLABLE, and the answer is
  // always the same - stop firing at the stone-grey ones and go through the
  // warden.
  //
  // Everything about it is built to be unmissable rather than clever. The
  // dome is drawn at exactly the radius it works at, the ring on the floor
  // says where the edge is from inside it, and anything it is protecting turns
  // to stone. A player who cannot tell why their shots stopped landing is the
  // one failure this enemy can have.
  warden: {
    hp: 70, speed: 2.0, damage: 0, score: 360, color: 0x9aa5b1, eye: 0xfff2b0,
    scale: 1.2, radius: 0.52, mass: 1,
    orbit: { dist: 10, band: 2, out: 0.7, in: -0.6, strafe: 0.3, flip: 2.2, flipVar: 2 },
    build: buildWarden, ai: aiWarden,
  },

  // ---- bosses ------------------------------------------------------------
  // Every fifth wave, in the rotation waves.js owns. All of them share the
  // same resistance block: a boss that can be frozen solid, feared into the
  // far corner or shoved out of its own attack is not a fight, and Entropy
  // would otherwise pin a status on one for the entire back third of the bar.
  //
  // `hp` here is the BASE. waves.js multiplies it by a curve that reaches
  // roughly 5.9x by wave 55.

  // The teaching boss. Armoured everywhere except a red core in its chest,
  // behind shutters that draw back on a fixed rhythm - so damage is a question
  // of WHEN the player is firing rather than how long they hold the trigger.
  // The core used to travel around the body instead, and half of every cycle
  // it sat behind three metres of armour with no way to reach it: a mechanic
  // the player could only wait out reads as the fight being broken. On the
  // chest it is always in front of them, and the only question is the timing.
  // Its charge is telegraphed a full second ahead and, if the player puts a
  // pillar or a wall behind themselves, it knocks itself down and hands over a
  // free window.
  colossus: {
    hp: 3600, speed: 2.0, damage: 34, score: 4000, color: 0x8c5a2b, eye: 0xffb300,
    scale: 3.2, radius: 2.0, mass: 8, boss: true,
    hitbox: { r: 0.72, y: 0.8 },
    statusMul: 0.3, freezeSlow: true, slowFactor: 0.75, freezeVuln: 1.0,
    entropyExempt: true, fearMode: 'stagger',
    // Only full damage while the core is open. Direction is deliberately NOT
    // consulted any more: the core sits on the face the boss already turns
    // toward the player, so a shot that reaches it came from the front by
    // construction, and a directional test would only find ways to refuse hits
    // the player can see landing. armorDefault matches the shut value, the
    // opposite of Bulwark's choice: a damage source that arrives without a
    // direction must not be able to bypass the mechanic by accident.
    armor: (e) => (e.bs.state === 'stagger' || e.bs.weakOpen ? 1 : 0.22),
    armorDefault: 0.22,
    build: buildColossus, ai: aiColossus,
    cleanup: releaseMarks,
  },

  // Artillery. Sits at the far end of the arena and makes the FLOOR the
  // threat: circles fill on the ground a second and a half before anything
  // lands, so every hit it scores is one the player was shown and stood in
  // anyway. A close-range sweep stops it being solved by walking up to it.
  siege: {
    hp: 3200, speed: 2.4, damage: 22, score: 5000, color: 0x455a64, eye: 0xff5533,
    scale: 2.6, radius: 1.6, mass: 6, boss: true,
    hitbox: { r: 0.72, y: 0.85 },
    statusMul: 0.3, freezeSlow: true, slowFactor: 0.75, freezeVuln: 1.0,
    entropyExempt: true, fearMode: 'stagger',
    orbit: { dist: 20, band: 2.5, out: 0.8, in: -0.9, strafe: 0.4, flip: 2, flipVar: 2 },
    build: buildSiege, ai: aiSiege,
    cleanup: releaseMarks,
  },

  // Splits at half health and again at a quarter, one into two into four. The
  // health here is HALF the fight's pool: the player deals 0.5H to force the
  // first split, 0.5H for the second and a full H to finish the four, so
  // clearing it costs 2x this number. See the sanity check in waves.js.
  schism: {
    hp: 1550, speed: 3.0, damage: 18, score: 6000, color: 0xd500f9, eye: 0xffb0ff,
    scale: 2.2, radius: 1.3, mass: 5, boss: true,
    hitbox: { r: 0.7, y: 0.8 },
    statusMul: 0.35, freezeSlow: true, slowFactor: 0.75, freezeVuln: 1.0,
    entropyExempt: true, fearMode: 'stagger',
    melee: { windup: 0.55, start: 2.6, hit: 3.2, cd: 1.6 },
    build: buildSchism, ai: aiSchism,
  },

  // A gravity well that will not let the player leave. It drags them in
  // continuously and rolls rings outward along the floor that have to be
  // JUMPED - the one boss that asks for a control the game has barely used.
  maw: {
    hp: 3300, speed: 1.2, damage: 26, score: 7000, color: 0x311b92, eye: 0x7c4dff,
    scale: 3.0, radius: 1.8, mass: 10, boss: true,
    hitbox: { r: 0.75, y: 0.8 },
    statusMul: 0.3, freezeSlow: true, slowFactor: 0.75, freezeVuln: 1.0,
    entropyExempt: true, fearMode: 'stagger',
    build: buildMaw, ai: aiMaw,
    cleanup: releaseMarks,
  },

  // The capstone. Blinks, volleys and leaves pools - the three things the
  // earlier fights taught, arriving together - and drops its cooldowns when it
  // is nearly dead, so the last third is the hardest part of the fight rather
  // than the easiest.
  herald: {
    hp: 3400, speed: 2.8, damage: 20, score: 9000, color: 0xffd54f, eye: 0xfff8e1,
    scale: 2.6, radius: 1.5, mass: 6, boss: true,
    hitbox: { r: 0.72, y: 0.85 },
    statusMul: 0.25, freezeSlow: true, slowFactor: 0.8, freezeVuln: 1.0,
    entropyExempt: true, fearMode: 'stagger',
    orbit: { dist: 13, band: 2.5, out: 0.7, in: -0.8, strafe: 0.5, flip: 1.5, flipVar: 1.5 },
    build: buildHerald, ai: aiHerald,
  },
};

// Frees any telegraph handles a boss was holding when it died. Bosses keep
// theirs in bs.mark or bs.marks; both are covered here so a boss only has to
// name this as its `cleanup`.
function releaseMarks(e) {
  const bs = e.bs;
  if (!bs || !bs.fx) return;
  if (bs.mark >= 0) {
    bs.fx.markRelease(bs.mark);
    bs.mark = -1;
  }
  if (bs.rings) {
    for (const r of bs.rings) bs.fx.markRelease(r.mark);
    bs.rings.length = 0;
  }
}

// Geometries and non-animated materials are built once and shared by every
// enemy of that type. Only the two materials an enemy mutates at runtime (body
// flash, eye glow) are per-instance, and dispose() frees those on death.
const geoCache = new Map();
function geo(key, make) {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}

const SHARED_MATS = {
  gunmetal: new THREE.MeshStandardMaterial({ color: 0x2a2f3d, roughness: 0.4, metalness: 0.6 }),
  tankPlate: new THREE.MeshStandardMaterial({ color: 0x3a2515, roughness: 0.5, metalness: 0.6 }),
  sniperBarrel: new THREE.MeshStandardMaterial({ color: 0x1a1f2b, roughness: 0.3, metalness: 0.8 }),
  sniperScope: new THREE.MeshStandardMaterial({ color: 0x0a0f1a, roughness: 0.2, metalness: 0.9 }),
  splitterCore: new THREE.MeshStandardMaterial({
    color: ENEMY_TYPES.splitter.color, emissive: ENEMY_TYPES.splitter.color, emissiveIntensity: 1.2,
    roughness: 0.2, metalness: 0.8, transparent: true, opacity: 0.8,
  }),
  splitterRing: new THREE.MeshStandardMaterial({
    color: ENEMY_TYPES.splitter.eye, emissive: ENEMY_TYPES.splitter.eye, emissiveIntensity: 0.8,
  }),
  bomberShell: new THREE.MeshStandardMaterial({ color: 0x2a2515, roughness: 0.5, metalness: 0.4 }),
  bomberPin: new THREE.MeshStandardMaterial({ color: 0xffd600, emissive: 0xffd600, emissiveIntensity: 1.5 }),
  bulwarkShield: new THREE.MeshStandardMaterial({
    color: 0x4a5568, roughness: 0.35, metalness: 0.75,
    emissive: 0xffd54f, emissiveIntensity: 0.25,
  }),
  conduitRing: new THREE.MeshStandardMaterial({
    color: 0x00e5b0, emissive: 0x00e5b0, emissiveIntensity: 1.4,
    roughness: 0.2, metalness: 0.7,
  }),
  blightSac: new THREE.MeshStandardMaterial({
    color: 0x7ac943, emissive: 0x7ac943, emissiveIntensity: 0.9,
    roughness: 0.3, metalness: 0.2, transparent: true, opacity: 0.8,
  }),
  wraithShroud: new THREE.MeshStandardMaterial({
    color: 0x6f5bff, emissive: 0x6f5bff, emissiveIntensity: 0.7,
    roughness: 0.5, metalness: 0.2, transparent: true, opacity: 0.45,
  }),
  magmaVent: new THREE.MeshStandardMaterial({
    color: 0xff7a18, emissive: 0xff5a00, emissiveIntensity: 1.6,
    roughness: 0.4, metalness: 0.1,
  }),
  magmaCrust: new THREE.MeshStandardMaterial({ color: 0x2b1a12, roughness: 0.9, metalness: 0.1 }),
  wardenCrown: new THREE.MeshStandardMaterial({
    color: 0xdfe6ef, emissive: 0xfff2b0, emissiveIntensity: 1.1,
    roughness: 0.25, metalness: 0.7,
  }),
  hitbox: new THREE.MeshBasicMaterial({ visible: false }),
};

const BODY_FLASH_HEX = 0xffffff;
const BODY_FLASH_INTENSITY = 0.9;
const BODY_BASE_INTENSITY = 0.18;

// ---- status effects ------------------------------------------------------
// Applied by the single-tier mutations in upgrades.js. A hit REFRESHES a
// status, it never stacks one: mutations have no second level, so there is no
// stronger poison to express. Duration is seconds remaining, counted down in
// update().
//
// STATUS_ORDER is tint priority. An enemy can carry several statuses at once,
// but it can only wear one colour, so the first active entry wins and the body
// holds that colour steadily - a body that alternated between green and orange
// every frame would read as a rendering fault, not as information.
const STATUS_ORDER = ['freeze', 'burn', 'poison', 'slow', 'fear'];
const STATUS_TINT = {
  freeze: 0xcfeaff,
  burn: 0xff7a18,
  poison: 0x39d353,
  slow: 0x63b3ff,
  fear: 0xb06bff,
};
// Well above BODY_BASE_INTENSITY (0.18) so an afflicted enemy is obvious in a
// crowd, and well below BODY_FLASH_INTENSITY (0.9) so it never reads as a hit.
const STATUS_INTENSITY = 0.55;
// How each status behaves as particles. The body tint says WHICH status an
// enemy is carrying, but only one at a time - an enemy can hold several and
// can only wear one colour. The particles are what show the rest, and they
// carry the character of the effect as motion rather than as colour alone:
//
//   burn    fast, hot, straight up - the only one that looks violent
//   poison  slow bubbles drifting up off the body
//   freeze  heavy crystals falling off it
//   slow    a cold sink, thinner and slower than freeze
//   fear    light wisps streaming upward and gone
//
// Every active status drips, not just the dominant one, so a poisoned and
// burning enemy reads as both. Counts and intervals are deliberately small:
// this runs per enemy per status, and a wave of twenty afflicted enemies has
// to stay inside the 1024-slot particle buffer with room for combat on top.
//
// `up` is passed straight to Effects.burst(), where it biases the spray
// upward; negative values sink.
const STATUS_FX = {
  burn: { interval: 0.14, count: 3, speed: 1.7, up: 2.8, life: 0.45, y: 0.9 },
  poison: { interval: 0.22, count: 2, speed: 0.7, up: 1.7, life: 0.8, y: 0.8 },
  freeze: { interval: 0.24, count: 3, speed: 0.6, up: -0.8, life: 0.7, y: 1.25 },
  slow: { interval: 0.3, count: 2, speed: 0.5, up: -0.5, life: 0.65, y: 1.1 },
  fear: { interval: 0.2, count: 2, speed: 1.3, up: 2.4, life: 0.4, y: 1.45 },
};
const SLOW_FACTOR = 0.5;
// Conduit's aura, read in takeDamage and _effSpeed. Kept modest: the point of
// a support unit is that it makes a crowd worth re-prioritising, not that it
// makes one unkillable.
const CONDUIT_RESIST = 0.7;
const CONDUIT_SPEED = 1.15;
// How far the aura reaches, and how many links it draws. The beam pool is
// eight deep and shared, so a conduit in a packed crowd shows a sample of what
// it is buffing rather than every last one.
const CONDUIT_RANGE = 7;
const CONDUIT_LINKS = 4;
// Warden's dome: how far the invincibility reaches, and the colour anything
// inside it turns. The radius is a compromise - wide enough that it obviously
// covers a group, narrow enough that walking round the edge of it is a real
// option and the warden is never safely parked out of reach behind its own
// protection.
const WARD_RANGE = 6.5;
const WARD_STONE = 0x8d9199;
// Magma's trail: how often it drops a patch while it is moving, and how big,
// how long and how hard each one burns. Five seconds is the brief - long
// enough that a corridor it walked down stays closed behind it.
const MAGMA_DROP_INTERVAL = 0.42;
const MAGMA_PATCH_RADIUS = 1.5;
const MAGMA_PATCH_LIFE = 5;
const MAGMA_PATCH_DPS = 12;
// Scratch for the drip's spawn point. Module-level and reused: the drip runs
// for every afflicted enemy several times a second.
const _dripAt = new THREE.Vector3();
// Scratch for the navigation heading. Module-level and consumed immediately:
// every enemy asks for one every frame.
const _steer = { x: 0, z: 0 };
// Petrify's reward: a frozen enemy cannot act, and takes half again as much.
const FREEZE_VULN = 1.5;

let idSeq = 0;

// ---- model builders ------------------------------------------------------
// One per type, named on its ENEMY_TYPES entry, and responsible for the WHOLE
// model: torso, limbs, eyes and props. Nothing is placed before these run.
//
// THE SILHOUETTE IS THE DESIGN. Every type used to share one capsule and a
// pair of eyes, with a small prop bolted on, so at the distance the game is
// actually played at the only thing telling a chaser from a bomber was its
// colour - and colour is exactly what the status tints overwrite. A frozen
// enemy and a poisoned one are not their own colour any more, so the shape has
// to carry the identity on its own. The test each of these has to pass is that
// it is still identifiable as a flat black shape.
//
// The shape language maps to behaviour, so the model teaches the mechanic:
//
//   rushes you        leaning forward, narrow, legs under it   chaser wraith magma
//   soaks you         wide, planted, top-heavy, thick legs     tank bulwark colossus
//   shoots you        upright, thin, asymmetric weapon side    shooter sniper
//   supports          floating, legless, symmetrical           conduit warden
//   denies ground     bloated, bottom-heavy, hunched           blight bomber
//   comes apart       visibly segmented into halves            splitter schism
//
// Everything is built from few-segment primitives - 4 to 6 sided prisms, cones
// and octahedra - and bodyMat carries flatShading, so the whole roster reads as
// cut facets rather than smooth blobs.
//
// `P` is the part helper described on partsFor(): geometry is authored at UNIT
// size and P scales and positions it by the type's `s`, so one cached geometry
// can be shared by types of different sizes.

// Builds the `P(key, make, opts)` helper a build() uses for every mesh it adds.
//
// Anything that must FLASH white on a hit and carry the status tint goes
// through P with the default material - that is the enemy's own bodyMat, the
// single object _applyBodyLook writes to. Pass `mat` only for trim that should
// keep its own colour regardless of what the body is doing (gunmetal, glowing
// cores), and `mat: e.eyeMat` for anything that should blink with the eyes.
//
// opts: x,y,z position and sx,sy,sz or s scale, all in UNIT space and
// multiplied up by the type's scale; rx,ry,rz rotation in radians; mat; and
// shadow:false for parts too small or too transparent to be worth a shadow.
function partsFor(e, g, s) {
  return function P(key, make, o = {}) {
    const m = new THREE.Mesh(geo(key, make), o.mat || e.bodyMat);
    m.position.set((o.x || 0) * s, (o.y || 0) * s, (o.z || 0) * s);
    m.rotation.set(o.rx || 0, o.ry || 0, o.rz || 0);
    const k = (o.s ?? 1) * s;
    m.scale.set((o.sx ?? 1) * k, (o.sy ?? 1) * k, (o.sz ?? 1) * k);
    m.castShadow = o.shadow !== false;
    g.add(m);
    return m;
  };
}

// Shared faceted primitives. Segment counts are deliberately low - these are
// the facets, and raising them is what would take the roster back to blobs.
const prism = (rt, rb, h, seg) => () => new THREE.CylinderGeometry(rt, rb, h, seg);
const spike = (r, h, seg) => () => new THREE.ConeGeometry(r, h, seg);
const slab = (w, h, d) => () => new THREE.BoxGeometry(w, h, d);
const shard = (r) => () => new THREE.OctahedronGeometry(r, 0);
const lump = (r) => () => new THREE.IcosahedronGeometry(r, 0);
const rock = (r) => () => new THREE.DodecahedronGeometry(r, 0);

// The default pair of eyes, on the -z face. `y` and `spread` move them; most
// types take the default. Types whose identity is a machine or a monolith
// (conduit, warden, maw) call something else or nothing at all.
function eyes(P, { y = 1.05, x = 0.13, z = -0.27, r = 1, mat }) {
  const o = { mat: mat || undefined, s: r, shadow: false };
  P('eyeShard', shard(0.07), { ...o, x: -x, y, z });
  P('eyeShard', shard(0.07), { ...o, x, y, z });
}

// ---- the original six ----------------------------------------------------

// Leaning forward from the ankles up, and the only thing in the roster with a
// snout. Read: it is already coming at you.
function buildChaser(e, g, s) {
  const P = partsFor(e, g, s);
  // FLATTENED FRONT TO BACK and only four sided. A six sided prism at this
  // size is a circle from the player's eye, which is what made the old roster
  // read as blobs; the wedge is what gives it a front.
  P('chaserTorso', prism(0.34, 0.16, 0.62, 4), {
    y: 0.92, z: -0.04, rx: -0.3, ry: Math.PI / 4, sz: 0.62,
  });
  // Neck, so the head is a separate mass instead of the top of the torso.
  P('chaserNeck', prism(0.08, 0.1, 0.16, 4), { y: 1.2, z: -0.18, rx: -0.5 });
  // The snout has to PROJECT PAST the torso outline or it is not in the
  // silhouette at all. It runs well forward of the body and sits low.
  P('chaserSkull', spike(0.15, 0.52, 4), { y: 1.24, z: -0.42, rx: -Math.PI / 2, ry: Math.PI / 4 });
  P('chaserJaw', spike(0.1, 0.34, 4), { y: 1.11, z: -0.4, rx: -Math.PI / 2, ry: Math.PI / 4 });
  // Two spines swept back off the shoulders. They break the top of the outline,
  // which is the part of a silhouette the player sees first.
  P('chaserSpine', spike(0.05, 0.42, 4), { x: -0.17, y: 1.28, z: 0.16, rx: 0.9 });
  P('chaserSpine', spike(0.05, 0.42, 4), { x: 0.17, y: 1.28, z: 0.16, rx: 0.9 });
  // Long enough to leave real air under the body. Short stubs read as no legs.
  P('chaserThigh', slab(0.11, 0.44, 0.13), { x: -0.16, y: 0.55, z: 0.08, rx: 0.35 });
  P('chaserThigh', slab(0.11, 0.44, 0.13), { x: 0.16, y: 0.55, z: 0.08, rx: 0.35 });
  P('chaserShin', slab(0.09, 0.42, 0.1), { x: -0.16, y: 0.21, z: -0.02, rx: -0.2 });
  P('chaserShin', slab(0.09, 0.42, 0.1), { x: 0.16, y: 0.21, z: -0.02, rx: -0.2 });
  eyes(P, { y: 1.3, x: 0.1, z: -0.32, r: 0.85, mat: e.eyeMat });
}

// Upright and still, with all of its mass on one side: the arm cannon is the
// silhouette. Read: it is standing off and shooting.
function buildShooter(e, g, s) {
  const P = partsFor(e, g, s);
  // Narrow, upright and flat: a thin plate of a body, so the cannon is what
  // has width. Standing straight is the read - it is not closing on you.
  P('shooterTorso', prism(0.3, 0.18, 0.7, 4), { y: 1.0, ry: Math.PI / 4, sz: 0.5 });
  // Head on a visible neck and much smaller than the torso, so the two do not
  // merge into one lump at distance.
  P('shooterNeck', prism(0.07, 0.07, 0.14, 4), { y: 1.4 });
  P('shooterHead', shard(0.15), { y: 1.56, sz: 0.7 });
  // THE CANNON IS THE SILHOUETTE. It hangs well outboard and reaches forward
  // past the body, so the outline is lopsided from every angle.
  P('shooterMount', slab(0.2, 0.2, 0.22), { x: 0.36, y: 1.12 });
  P('shooterBarrel', prism(0.1, 0.14, 0.8, 6), {
    x: 0.36, y: 1.12, z: -0.42, rx: -Math.PI / 2, mat: SHARED_MATS.gunmetal,
  });
  P('shooterVent', slab(0.26, 0.1, 0.16), { x: 0.36, y: 1.28, z: -0.1, mat: SHARED_MATS.gunmetal });
  // The other arm is a thin rod, which is what makes the cannon side read as
  // heavy rather than just as detail.
  P('shooterArm', slab(0.07, 0.5, 0.07), { x: -0.3, y: 1.02 });
  P('shooterLeg', slab(0.1, 0.62, 0.1), { x: -0.14, y: 0.32 });
  P('shooterLeg', slab(0.1, 0.62, 0.1), { x: 0.14, y: 0.32 });
  eyes(P, { y: 1.58, x: 0.08, z: -0.13, r: 0.75, mat: e.eyeMat });
}

// An inverted trapezoid: everything is up top. Read: hitting it will not move
// it, and getting hit by it will.
function buildTank(e, g, s) {
  const P = partsFor(e, g, s);
  // Wide at the shoulders, narrow at the waist - the opposite taper to blight.
  P('tankTorso', prism(0.5, 0.28, 0.72, 4), { y: 0.86, ry: Math.PI / 4 });
  P('tankPauldron', slab(0.34, 0.36, 0.36), { x: -0.5, y: 1.06 });
  P('tankPauldron', slab(0.34, 0.36, 0.36), { x: 0.5, y: 1.06 });
  // Head sunk between the pauldrons rather than sitting above them.
  P('tankHead', slab(0.26, 0.2, 0.24), { y: 1.12, z: -0.14 });
  // Chest plate, kept in its own dark material as the armour read.
  P('tankPlate', slab(0.66, 0.16, 0.12), { y: 0.92, z: -0.3, mat: SHARED_MATS.tankPlate });
  P('tankLeg', slab(0.2, 0.44, 0.22), { x: -0.22, y: 0.22 });
  P('tankLeg', slab(0.2, 0.44, 0.22), { x: 0.22, y: 0.22 });
  eyes(P, { y: 1.14, x: 0.08, z: -0.27, r: 0.8, mat: e.eyeMat });
}

// The only tripod in the game, and the tallest thin thing in it. Read: it is
// set up, a long way off, and pointed at you.
function buildSniper(e, g, s) {
  const P = partsFor(e, g, s);
  P('sniperTorso', prism(0.15, 0.21, 0.5, 5), { y: 1.12 });
  P('sniperHead', slab(0.22, 0.15, 0.28), { y: 1.46 });
  // Three legs splayed off a hub. Splaying by rotating each one outward along
  // its own bearing is what keeps this readable from any angle.
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
    P('sniperLeg', prism(0.03, 0.055, 1.0, 4), {
      x: Math.cos(a) * 0.19, y: 0.5, z: Math.sin(a) * 0.19,
      rz: -Math.cos(a) * 0.32, rx: Math.sin(a) * 0.32,
    });
  }
  P('sniperBarrel', prism(0.045, 0.055, 1.0, 6), {
    y: 1.46, z: -0.66, rx: Math.PI / 2, mat: SHARED_MATS.sniperBarrel,
  });
  P('sniperScope', slab(0.1, 0.11, 0.22), { y: 1.6, z: -0.16, mat: SHARED_MATS.sniperScope });
  eyes(P, { y: 1.47, x: 0.07, z: -0.15, r: 0.7, mat: e.eyeMat });
}

// Two shards stacked with a lit seam between them. Read: this is already two
// things, and killing it will prove it.
function buildSplitter(e, g, s) {
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

// A pear: all of the mass low, a small head on top, stubby legs under a belly
// full of ordnance. Read: slow, and carrying something.
function buildBomber(e, g, s) {
  const P = partsFor(e, g, s);
  // Bomber, blight and magma are the three heavy-set types, and the first pass
  // had all three reading as the same round lump. What separates them is where
  // the mass SITS: the bomber's belly is carried HIGH on long thin legs, the
  // blight's is dumped flat on the floor, and the magma's is stacked upward.
  P('bomberBelly', lump(0.44), { y: 0.82, sy: 0.92, sz: 0.86 });
  // A pinched neck, so the head is not just the top of the belly.
  P('bomberNeck', prism(0.08, 0.1, 0.14, 4), { y: 1.22 });
  P('bomberHead', shard(0.15), { y: 1.36, sy: 0.8 });
  // Long, thin and splayed. The air under the belly is half the silhouette.
  P('bomberLeg', slab(0.08, 0.68, 0.09), { x: -0.24, y: 0.34, rz: 0.16 });
  P('bomberLeg', slab(0.08, 0.68, 0.09), { x: 0.24, y: 0.34, rz: -0.16 });
  P('bomberFoot', slab(0.16, 0.08, 0.2), { x: -0.29, y: 0.04 });
  P('bomberFoot', slab(0.16, 0.08, 0.2), { x: 0.29, y: 0.04 });
  // The rack stands proud of the back so the load is in the outline, not
  // buried in it - a bomber seen from behind should still read as carrying.
  for (let i = 0; i < 3; i++) {
    const up = i === 1 ? 0.14 : 0;
    P('bomberShell', lump(0.14), {
      x: (i - 1) * 0.22, y: 1.02 + up, z: 0.42, mat: SHARED_MATS.bomberShell,
    });
    P('bomberPin', prism(0.02, 0.02, 0.16, 4), {
      x: (i - 1) * 0.22, y: 1.18 + up, z: 0.42, mat: SHARED_MATS.bomberPin, shadow: false,
    });
  }
  eyes(P, { y: 1.38, x: 0.08, z: -0.15, r: 0.8, mat: e.eyeMat });
}

// Legless and hovering, a narrow spike with a ragged hem. Read: it is not
// walking anywhere, and it will be behind you.
function buildWraith(e, g, s) {
  const P = partsFor(e, g, s);
  P('wraithCore', shard(0.21), { y: 0.98 });
  P('wraithSpike', spike(0.11, 0.6, 4), { y: 1.5 });
  // A loose open shroud rather than a hard body: it should read as something
  // only partly there, so a blink looks like the trick it was already doing.
  const shroud = new THREE.Mesh(
    geo('wraithShroud', () => new THREE.ConeGeometry(0.44, 1.15, 6, 1, true)),
    SHARED_MATS.wraithShroud
  );
  shroud.position.y = 0.72 * s;
  shroud.scale.setScalar(s);
  g.add(shroud);
  // The hem, torn into three points. This is what says it has no feet.
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    P('wraithTatter', spike(0.1, 0.42, 4), {
      x: Math.cos(a) * 0.26, y: 0.26, z: Math.sin(a) * 0.26, rx: Math.PI,
    });
  }
  P('wraithBlade', spike(0.07, 0.55, 4), { x: 0.24, y: 1.0, z: -0.4, rx: -Math.PI / 2 });
  eyes(P, { y: 1.05, x: 0.09, z: -0.19, r: 0.85, mat: e.eyeMat });
}

// Squat and wide behind a hexagonal plate that is most of its footprint. Read:
// the front is closed, so go around it.
function buildBulwark(e, g, s) {
  const P = partsFor(e, g, s);
  P('bulwarkTorso', prism(0.4, 0.46, 0.58, 6), { y: 0.7 });
  P('bulwarkHead', slab(0.24, 0.16, 0.22), { y: 1.06, z: -0.1 });
  // Thick and short. A bulwark that looked like it could run would be lying.
  P('bulwarkLeg', slab(0.22, 0.34, 0.24), { x: -0.26, y: 0.17 });
  P('bulwarkLeg', slab(0.22, 0.34, 0.24), { x: 0.26, y: 0.17 });
  // The shield is the whole read of this enemy, so it is wide, flat and in
  // front - the player has to be able to tell at a glance which way it faces.
  P('bulwarkShield', prism(0.62, 0.62, 0.1, 6), {
    y: 0.8, z: -0.52, rx: Math.PI / 2, mat: SHARED_MATS.bulwarkShield,
  });
  P('bulwarkBoss', shard(0.14), { y: 0.8, z: -0.6, mat: SHARED_MATS.wardenCrown });
  eyes(P, { y: 1.08, x: 0.08, z: -0.22, r: 0.75, mat: e.eyeMat });
}

// A floating spindle with nothing that could hold a weapon, and no eyes at
// all. Read: it is a machine, it is not attacking, and it is the reason the
// crowd stopped dying.
function buildConduit(e, g, s) {
  const P = partsFor(e, g, s);
  P('conduitCore', shard(0.32), { y: 1.0 });
  P('conduitCap', spike(0.22, 0.32, 6), { y: 1.42 });
  P('conduitKeel', spike(0.26, 0.46, 6), { y: 0.48, rx: Math.PI });
  // Two rings on different axes, spun in update. A support unit has to look
  // like a machine doing something rather than another soldier.
  const ringGeo = geo('conduitRing', () => new THREE.TorusGeometry(0.36, 0.035, 6, 14));
  const r1 = new THREE.Mesh(ringGeo, SHARED_MATS.conduitRing);
  r1.position.y = 1.0 * s;
  r1.scale.setScalar(s);
  const r2 = new THREE.Mesh(ringGeo, SHARED_MATS.conduitRing);
  r2.position.y = 1.0 * s;
  r2.scale.setScalar(s);
  r2.rotation.y = Math.PI / 2;
  e.ringA = r1;
  e.ringB = r2;
  g.add(r1, r2);
}

// Bottom-heavy and hunched, tapering the opposite way to a tank, with a
// drooping nozzle. Read: everything it has is going onto the floor.
function buildBlight(e, g, s) {
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
function buildMagma(e, g, s) {
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
function buildWarden(e, g, s) {
  const P = partsFor(e, g, s);
  P('wardenShaft', prism(0.24, 0.36, 1.24, 4), { y: 0.72, ry: Math.PI / 4 });
  P('wardenTip', spike(0.24, 0.4, 4), { y: 1.54, ry: Math.PI / 4 });
  P('wardenBase', prism(0.4, 0.34, 0.16, 4), { y: 0.08, ry: Math.PI / 4 });
  // One horizontal slit rather than a pair of dots. Nothing else in the roster
  // reads this way, and it is what makes a warden findable in a crowd.
  P('wardenSlit', slab(0.34, 0.055, 0.05), { y: 1.1, z: -0.26, mat: e.eyeMat, shadow: false });

  // The DOME is the enemy. It is built at exactly WARD_RANGE so what the
  // player sees and what the aura protects are the same number, and it is
  // open-topped so it never fills the screen when the player is standing
  // inside it - the ring on the floor is what they read from in there.
  const domeMat = new THREE.MeshBasicMaterial({
    color: 0xbfc7d2, transparent: true, opacity: 0.06,
    side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xdfe6ef, transparent: true, opacity: 0.85,
    side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  e._extraMats.push(domeMat, ringMat);
  const dome = new THREE.Mesh(
    geo('wardenDome', () => new THREE.SphereGeometry(WARD_RANGE, 26, 10, 0, Math.PI * 2, 0, Math.PI * 0.42)),
    domeMat
  );
  const ring = new THREE.Mesh(
    geo('wardenRing', () => new THREE.RingGeometry(WARD_RANGE - 0.32, WARD_RANGE, 64)),
    ringMat
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.05;
  // The dome and ring sit at the enemy's FEET and must not inherit the model's
  // scale, so they are added to the group directly at world size - `s` is
  // already baked into every other part.
  e.wardDome = domeMat;
  e.wardRing = ringMat;
  g.add(dome, ring);

  const crown = new THREE.Mesh(
    geo('wardenCrown', () => new THREE.TorusGeometry(0.34, 0.05, 6, 12)),
    SHARED_MATS.wardenCrown
  );
  crown.rotation.x = Math.PI / 2;
  crown.position.y = 1.36 * s;
  crown.scale.setScalar(s);
  e.crown = crown;
  g.add(crown);
}

// ---- bosses --------------------------------------------------------------
// Built from the same primitives as everything else, at a much larger `scale`,
// plus the one part that carries the fight's mechanic. A boss silhouette has
// to be legible at the distance the arena is fought across, so these lean on
// overall proportion rather than on detail that would vanish.

// How long the chest core stays shut and how long it stays open, in seconds.
// The old travelling plate gave a player who kept repositioning roughly half
// the fight at full damage, and this is tuned to land in the same place: the
// boss's health bar falls at the pace it always did, but the player is reading
// a rhythm instead of chasing a panel around a body they cannot see behind.
const COLOSSUS_VENT_SHUT = 3.4;
const COLOSSUS_VENT_OPEN = 2.6;
// Shutter travel, in UNIT model space: where each leaf sits closed, and how
// far out it slides. Closed at 0.26 the two leaves overlap over the core's
// centre line and cover its full 0.85 width with no seam.
const COLOSSUS_SHUT_X = 0.26;
const COLOSSUS_SHUT_TRAVEL = 0.46;
// Core brightness, shut and open. The shut value is deliberately not zero - a
// dark core would read as damage or as a hole rather than as something waiting
// to open. The open value is deliberately NOT higher: the renderer tone maps
// with ACES, which desaturates anything it has to clip, and at 2.2 the core
// came out a pale salmon against the boss's own amber room. Held at 1.2 it
// stays unmistakably RED, which is the entire point of the colour.
const COLOSSUS_CORE_SHUT = 0.22;
const COLOSSUS_CORE_OPEN = 1.2;
// VENT FIRE. The open core used to be free damage: the player learned the
// rhythm, walked in on the beat and unloaded, and the fight had nothing to say
// about it. It now fires while it is open, so the window that lets you hurt it
// is the window it can hurt you and standing still in front of the chest stops
// being the answer. Three rounds in a narrow fan, on a cadence slower than the
// window is long, so an opening is two or three volleys and never a stream.
const COLOSSUS_VENT_SHOT_CD = 0.65;
const COLOSSUS_VENT_FAN = 0.13;

// The widest thing in the game, on two thick legs, with a shuttered core in
// its chest.
function buildColossus(e, g, s) {
  const P = partsFor(e, g, s);
  P('colossusTorso', prism(0.6, 0.4, 0.86, 6), { y: 0.88 });
  P('colossusPauldron', slab(0.46, 0.5, 0.46), { x: -0.52, y: 1.08 });
  P('colossusPauldron', slab(0.46, 0.5, 0.46), { x: 0.52, y: 1.08 });
  P('colossusHead', slab(0.3, 0.24, 0.28), { y: 1.16, z: -0.16 });
  P('colossusLeg', slab(0.28, 0.5, 0.3), { x: -0.26, y: 0.25 });
  P('colossusLeg', slab(0.28, 0.5, 0.3), { x: 0.26, y: 0.25 });
  // Moved to the BACK. The chest is where the weak point lives now, and two
  // plates fighting for the same face read as one confusing lump of armour.
  P('colossusPlate', slab(0.8, 0.18, 0.14), { y: 0.96, z: 0.36, mat: SHARED_MATS.tankPlate });
  eyes(P, { y: 1.18, x: 0.1, z: -0.31, r: 1.1, mat: e.eyeMat });

  // THE WEAK POINT. Sunk into the chest, on the -z face every model in the
  // roster fronts with, so it is square-on to the player for the whole fight.
  // Its material is per-instance because it burns brighter as the shutters
  // open, so it is registered for disposal.
  const mat = new THREE.MeshStandardMaterial({
    // Nearly black BASE colour: the room's light is the boss's own amber and a
    // red-lit red surface would drift orange. All of the colour here is
    // emissive, which no light in the room can tint.
    color: 0x1e0402, emissive: 0xff1408, emissiveIntensity: COLOSSUS_CORE_SHUT,
    roughness: 0.35, metalness: 0.2,
  });
  e._extraMats.push(mat);
  // Big, and standing proud of the body. This is the single thing the player
  // has to find on a boss three metres wide, from across an arena, while being
  // charged at - a subtle glowing panel is the same as no mechanic at all. Red
  // because nothing else on this model is: the eyes and the charge lane are
  // amber, so red on the chest can only mean one thing.
  const core = new THREE.Mesh(
    geo('colossusCore', () => new THREE.BoxGeometry(0.85, 0.8, 0.22)),
    mat
  );
  // Set into the LOWER chest. Any higher and the shutters, which stand further
  // forward than the head does, cover the eyes - and the eyes going alert are
  // the telegraph for the charge, the one tell on this boss that must never be
  // hidden by another.
  core.position.set(0, 0.72 * s, -0.56 * s);
  core.scale.setScalar(s);
  g.add(core);

  // The shutters. Two armoured leaves that meet over the core and slide apart
  // to expose it; they are the TELL, and they are big and mechanical so the
  // player reads the window opening from across the room rather than having to
  // notice a glow change. Their closed positions overlap the core's edges, so
  // shut really does mean covered from every angle the fight is played at.
  const leafGeo = geo('colossusShutter', () => new THREE.BoxGeometry(0.54, 0.86, 0.16));
  const shutters = [];
  for (const sign of [-1, 1]) {
    const leaf = new THREE.Mesh(leafGeo, SHARED_MATS.tankPlate);
    leaf.position.set(sign * COLOSSUS_SHUT_X * s, 0.72 * s, -0.63 * s);
    leaf.scale.setScalar(s);
    leaf.castShadow = true;
    g.add(leaf);
    shutters.push({ mesh: leaf, sign });
  }

  e.bs.coreMat = mat;
  e.bs.coreMesh = core;
  e.bs.shutters = shutters;
  // The model scale, kept here because the shutters are positioned per frame
  // and Enemy itself does not carry its type's `scale`.
  e.bs.mScale = s;
  // Starts shut, so the fight opens with the player learning what closed looks
  // like before the first window arrives.
  e.bs.weakOpen = false;
  e.bs.ventT = COLOSSUS_VENT_SHUT;
  e.bs.vent = 0;
}

// Legless: a wide braced platform with a barrel angled at the sky. Read: it is
// not chasing you, it is ranging on you.
function buildSiege(e, g, s) {
  const P = partsFor(e, g, s);
  P('siegeBase', prism(0.6, 0.78, 0.32, 6), { y: 0.18 });
  P('siegeHull', prism(0.44, 0.58, 0.5, 6), { y: 0.62 });
  // Outriggers braced on the floor, so the whole thing reads as planted.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    P('siegeFoot', slab(0.26, 0.16, 0.26), {
      x: Math.cos(a) * 0.78, y: 0.09, z: Math.sin(a) * 0.78, ry: a,
      mat: SHARED_MATS.tankPlate,
    });
  }
  P('siegeMantlet', slab(0.5, 0.34, 0.3), { y: 0.98, z: -0.14 });
  // Angled up: it lobs rather than shoots, and the silhouette should say so
  // from across the arena.
  P('siegeBarrel', prism(0.13, 0.19, 1.2, 8), {
    y: 1.18, z: -0.42, rx: -Math.PI / 3, mat: SHARED_MATS.sniperBarrel,
  });
  eyes(P, { y: 1.0, x: 0.16, z: -0.3, r: 1.1, mat: e.eyeMat });
}

// Two crystals side by side with a lit gap between them. The whole model is
// the mechanic: it is already two, and it is going to be four.
function buildSchism(e, g, s) {
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

// A funnel: wide open at the top, narrowing to nothing at the floor. Nothing
// else in the game is wider at the top, and that is the whole read - it is a
// mouth, and it is pulling.
function buildMaw(e, g, s) {
  const P = partsFor(e, g, s);
  P('mawFunnel', prism(0.78, 0.18, 1.05, 8), { y: 0.62 });
  P('mawStem', prism(0.18, 0.3, 0.2, 6), { y: 0.1 });
  // Teeth around the rim, pointing inward and down into the throat.
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    P('mawTooth', spike(0.09, 0.34, 4), {
      x: Math.cos(ang) * 0.66, y: 1.0, z: Math.sin(ang) * 0.66,
      rx: Math.PI - Math.sin(ang) * 0.4, rz: Math.cos(ang) * 0.4,
    });
  }
  P('mawVoid', shard(0.44), { y: 0.95, mat: SHARED_MATS.sniperScope, shadow: false });
  const maw = new THREE.Mesh(
    geo('mawRing', () => new THREE.TorusGeometry(0.8, 0.13, 8, 16)),
    SHARED_MATS.conduitRing
  );
  maw.rotation.x = Math.PI / 2;
  maw.position.y = 1.14 * s;
  maw.scale.setScalar(s);
  e.ringA = maw;
  g.add(maw);
}

// Tall, robed and crowned - the only thing in the roster with a skirt, and the
// tallest silhouette in the game. Read: this is the last one.
function buildHerald(e, g, s) {
  const P = partsFor(e, g, s);
  // The robe has to MEET the torso. As a plain cone it tapered to a point
  // well under the body and the two read as separate objects stacked in the
  // air; a truncated cone keeps the silhouette one continuous figure.
  P('heraldRobe', prism(0.3, 0.62, 0.92, 6), { y: 0.46 });
  P('heraldTorso', prism(0.24, 0.32, 0.56, 6), { y: 1.14 });
  P('heraldShoulder', slab(0.26, 0.14, 0.3), { x: -0.3, y: 1.34, rz: 0.4 });
  P('heraldShoulder', slab(0.26, 0.14, 0.3), { x: 0.3, y: 1.34, rz: -0.4 });
  P('heraldHead', shard(0.19), { y: 1.58 });
  const crownGeo = spike(0.09, 0.5, 4);
  for (let i = 0; i < 5; i++) {
    const ang = (i / 5) * Math.PI * 2;
    P('heraldSpire', crownGeo, {
      x: Math.cos(ang) * 0.3, y: 1.72, z: Math.sin(ang) * 0.3,
    });
  }
  const halo = new THREE.Mesh(
    geo('heraldHalo', () => new THREE.TorusGeometry(0.5, 0.045, 6, 16)),
    SHARED_MATS.conduitRing
  );
  halo.rotation.x = Math.PI / 2;
  halo.position.y = 1.98 * s;
  halo.scale.setScalar(s);
  e.ringA = halo;
  g.add(halo);
  eyes(P, { y: 1.52, x: 0.09, z: -0.16, r: 0.9, mat: e.eyeMat });
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

// The two melee types differ only in their windup numbers, which live on the
// type as `melee`.
function aiMelee(e, a) {
  const m = ENEMY_TYPES[e.type].melee;
  if (e._meleeCycle(a.dt, a.dist, a.ctx, m.windup, m.start, m.hit, m.cd)) {
    a.vx = a.px * a.sp;
    a.vz = a.pz * a.sp;
  }
}

// Hold a preferred distance and circle. `out`/`in` are how hard to close or
// back off outside the band; `strafe` is how much sideways drift rides on top.
// The strafe direction flips on its own timer so a line of shooters does not
// orbit in lockstep.
function orbit(e, a, o) {
  e.strafeT -= a.dt;
  if (e.strafeT <= 0) {
    e.strafe *= -1;
    e.strafeT = o.flip + Math.random() * o.flipVar;
  }
  const along = a.dist > o.dist + o.band ? o.out : a.dist < o.dist - o.band ? o.in : 0;
  a.vx = a.px * a.sp * along + -a.pz * e.strafe * a.sp * o.strafe;
  a.vz = a.pz * a.sp * along + a.px * e.strafe * a.sp * o.strafe;
}

function aiSplitter(e, a) {
  aiMelee(e, a);
  e.coreMesh.rotation.y += a.dt * 3;
  e.ringMesh.rotation.z += a.dt * 2;
}

function aiShooter(e, a) {
  orbit(e, a, ENEMY_TYPES.shooter.orbit);
  if (e.attackCd <= 0 && a.dist < 18) {
    e.attackCd = 1.6 + Math.random() * 0.6;
    e.flash = 0.12;
    a.ctx.addProjectile(e.pos.x, 0.95, e.pos.z, 'shooter', e._projScale());
  }
}

function aiSniper(e, a) {
  orbit(e, a, ENEMY_TYPES.sniper.orbit);
  if (e.attackCd <= 0 && a.dist < 35) {
    e.attackCd = 2.0 + Math.random() * 0.5;
    e.flash = 0.1;
    a.ctx.addProjectile(e.pos.x, 1.1, e.pos.z, 'sniper', e._projScale());
  }
}

function aiBomber(e, a) {
  orbit(e, a, ENEMY_TYPES.bomber.orbit);
  if (e.attackCd <= 0 && a.dist < 16) {
    e.attackCd = 2.5 + Math.random() * 0.8;
    e.flash = 0.15;
    a.ctx.addGrenade(e.pos.x, 1.2, e.pos.z, e.damage);
  }
}

// Blink flanker. It closes the way anything else does, but every few seconds
// it jumps to the space BEHIND the player, which is the whole point of the
// type - a player watching the crowd in front never sees it arrive.
function aiWraith(e, a) {
  aiMelee(e, a);
  e.blinkCd -= a.dt;
  // Only from the middle distance. Blinking while already in melee would just
  // teleport it out of its own swing, and from across the arena it reads as
  // the enemy cheating rather than flanking.
  if (e.blinkCd > 0 || a.dist < 6 || a.dist > 20) return;
  e.blinkCd = 2.6 + Math.random() * 1.4;

  const p = a.ctx.player;
  const f = p.forwardInto(_blinkFwd);
  // Behind the player first; if that lands in a wall or a crate, in front of
  // them instead, which still puts it somewhere they were not looking at.
  let tx = p.pos.x - f.x * 2.5;
  let tz = p.pos.z - f.z * 2.5;
  _blinkAt.set(tx, 0.5, tz);
  const B = 21.6 - (e.radius - 0.5);
  if (Math.abs(tx) > B || Math.abs(tz) > B || pointInObstacle(_blinkAt, a.ctx.obstacles)) {
    tx = p.pos.x + f.x * 3;
    tz = p.pos.z + f.z * 3;
    _blinkAt.set(tx, 0.5, tz);
    if (Math.abs(tx) > B || Math.abs(tz) > B || pointInObstacle(_blinkAt, a.ctx.obstacles)) return;
  }

  // Both ends burst, so the move is legible as one thing that went from here
  // to there rather than as two unrelated enemies.
  if (a.ctx.effects) {
    _blinkAt.set(e.pos.x, 0.9, e.pos.z);
    a.ctx.effects.burst(_blinkAt, ENEMY_TYPES.wraith.color, 12, 5, 2, 0.4);
  }
  e.pos.x = tx;
  e.pos.z = tz;
  resolveCircle(e.pos, e.radius, a.ctx.obstacles, e.collideH);
  if (a.ctx.effects) {
    _blinkAt.set(e.pos.x, 0.9, e.pos.z);
    a.ctx.effects.burst(_blinkAt, ENEMY_TYPES.wraith.color, 14, 5, 2, 0.45);
  }
}

// No attack of its own - it keeps its distance and makes everything near it
// harder to kill. The links are not decoration: they are the only way the
// player can tell which enemies are being buffed and therefore why the crowd
// suddenly stopped dying.
function aiConduit(e, a) {
  orbit(e, a, ENEMY_TYPES.conduit.orbit);
  e.ringA.rotation.z += a.dt * 1.6;
  e.ringB.rotation.x += a.dt * 1.2;

  let drawn = 0;
  for (const o of a.ctx.enemies) {
    // Bosses are excluded deliberately. A conduit parked next to one would add
    // 43% to that fight's length for free, and the player would have no way to
    // read where the extra health was coming from.
    if (o === e || o.dead || o.boss || o.type === 'conduit') continue;
    const dx = o.pos.x - e.pos.x;
    const dz = o.pos.z - e.pos.z;
    if (dx * dx + dz * dz > CONDUIT_RANGE * CONDUIT_RANGE) continue;
    // Refreshed, never accumulated: it lapses on its own a fraction of a
    // second after this conduit stops running, which is what makes killing one
    // feel immediate.
    o.buffT = 0.2;
    if (drawn++ < CONDUIT_LINKS && a.ctx.effects) a.ctx.effects.beam(e.pos, o.pos, 0x00e5b0);
  }
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
function aiBlight(e, a) {
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

// Walks the player down and burns the floor as it goes. The patch is dropped
// where it HAS been, never where it is going: a trail the player can be
// steered into is area denial, one that appears under their feet is an
// unavoidable hit.
function aiMagma(e, a) {
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

// No attack of its own. It keeps a middle distance and makes everything under
// its dome unkillable, so it converts a crowd the player was already shooting
// into a wall - and the fix is to walk in and delete the warden.
//
// It never wards ITSELF and never wards another warden: a pair that covered
// each other would be a stalemate with no way in, and a warden inside its own
// dome would simply be an enemy that cannot be killed.
function aiWarden(e, a) {
  orbit(e, a, ENEMY_TYPES.warden.orbit);
  e.crown.rotation.z += a.dt * 1.4;
  // The dome breathes so it never reads as a static piece of scenery, and
  // brightens with how much it is currently doing.
  let held = 0;
  for (const o of a.ctx.enemies) {
    if (o === e || o.dead || o.boss || o.type === 'warden') continue;
    const dx = o.pos.x - e.pos.x;
    const dz = o.pos.z - e.pos.z;
    if (dx * dx + dz * dz > WARD_RANGE * WARD_RANGE) continue;
    // Refreshed, never accumulated, exactly like a conduit's buff: it lapses
    // a fraction of a second after the warden dies, so killing one makes the
    // whole group take damage again immediately.
    o.wardT = 0.2;
    held++;
  }
  const pulse = 0.8 + Math.sin(a.ctx.time * 3.4 + e.id) * 0.2;
  // Kept low even when it is doing its job: at the edge of the dome it fills
  // the screen, and an aura that washes out the enemies inside it would hide
  // the stone grey that is the other half of the tell.
  e.wardDome.opacity = (held > 0 ? 0.10 : 0.05) * pulse;
  e.wardRing.opacity = (held > 0 ? 1.0 : 0.55) * pulse;
}

// COLOSSUS. Four states, and the whole fight is the player reading which one
// it is in: walking (keep to the glowing side), telegraphing (get something
// solid behind you), charging (be elsewhere), knocked down (everything you
// have). Damage is capped per attack rather than left to scale, because the
// wave-55 multiplier on a 34 point hit would be a one-shot.
// How far above itself a boss's ground attacks reach. Bosses stand 4-6m tall
// so this is far more generous than MELEE_REACH_Y, and it clears a player
// jumping from the tallest platform (1.6 + a 1.84 apex = 3.44). It stops short
// of the perimeter catwalk decks at 4.05: like every other melee in the game,
// a boss's swing pools below the walkways while its adds - gunners, artillery,
// mortars - are what punish standing up there. Without this the ground
// shockwave of a slam hit a player four metres overhead.
const BOSS_REACH_Y = 3.6;
// How far the player is above the arena floor. `a.dist` throughout the boss AI
// is XZ-only - the whole game collides in 2D - so this is the missing axis.
function _reachY(a) {
  return Math.abs(a.ctx.player.pos.y);
}
const COLOSSUS_CHARGE_CAP = 52;
const COLOSSUS_SLAM_CAP = 44;
const COLOSSUS_CHARGE_SPEED = 14;

// Drives the shutters and the core glow toward `open`. Eased rather than
// snapped: the leaves visibly travelling is what turns the window into
// something the player sees coming instead of something that has already
// happened. `bs.vent` is the 0..1 position of that travel.
function _colossusVent(bs, dt, open) {
  bs.vent += ((open ? 1 : 0) - bs.vent) * Math.min(1, dt * 6);
  const x = (COLOSSUS_SHUT_X + COLOSSUS_SHUT_TRAVEL * bs.vent) * bs.mScale;
  for (const sh of bs.shutters) sh.mesh.position.x = sh.sign * x;
  // A slow throb while it is open, so the exposed core is the only thing on
  // the model that is moving in place.
  const pulse = open ? 1 + 0.25 * Math.sin(bs.ventT * 9) : 1;
  bs.coreMat.emissiveIntensity =
    (COLOSSUS_CORE_SHUT + (COLOSSUS_CORE_OPEN - COLOSSUS_CORE_SHUT) * bs.vent) * pulse;
}

function aiColossus(e, a) {
  const bs = e.bs;
  if (bs.state === undefined) {
    bs.state = 'walk';
    bs.t = 0;
    bs.cd = 4;
    bs.slamCd = 2;
    bs.slamT = 0;
    bs.dirX = 0;
    bs.dirZ = 1;
    bs.mark = -1;
    bs.shotCd = COLOSSUS_VENT_SHOT_CD;
  }
  const ctx = a.ctx;
  bs.fx = ctx.effects;
  const feared = e.status.fear > 0;

  // THE CORE'S RHYTHM. It runs on its own clock, unbroken by whatever the
  // fight is doing, because the whole point of moving the weak point off the
  // body's surface and onto a timer was to make it something the player can
  // learn and count on. A knockdown opens it early and holds it open, which is
  // still the biggest window in the fight.
  if (bs.state === 'stagger') {
    _colossusVent(bs, a.dt, true);
  } else {
    bs.ventT -= a.dt;
    if (bs.ventT <= 0) {
      bs.weakOpen = !bs.weakOpen;
      bs.ventT = bs.weakOpen ? COLOSSUS_VENT_OPEN : COLOSSUS_VENT_SHUT;
      if (bs.weakOpen) {
        _bossAt.set(e.pos.x, 0.9 * bs.mScale, e.pos.z);
        ctx.effects.burst(_bossAt, 0xff2418, 12, 4, 1.5, 0.45);
      }
      // Re-armed on every flip, so the first volley of an opening costs the
      // same wind-up as the rest and a player who is already in position gets
      // a moment to commit or back out.
      bs.shotCd = COLOSSUS_VENT_SHOT_CD;
      ctx.bossEvent('vent', e);
    }
    _colossusVent(bs, a.dt, bs.weakOpen);
  }

  if (bs.state === 'stagger') {
    bs.t -= a.dt;
    if (bs.t <= 0) {
      bs.state = 'walk';
      bs.cd = 6 * e.rate;
      // Handed back to the vent clock mid-cycle rather than reset, so the
      // rhythm the player has been counting survives the knockdown.
      ctx.bossEvent('recover', e);
    }
    return;
  }

  if (bs.state === 'tele') {
    bs.t -= a.dt;
    e._setEyeAlert(true);
    // The lane is drawn at full length from the first frame so the AREA reads
    // instantly, and fills so the TIMING reads as it goes.
    const len = 22;
    ctx.effects.markSet(
      bs.mark,
      e.pos.x + bs.dirX * len * 0.5, e.pos.z + bs.dirZ * len * 0.5,
      1.9, 0xff5533, 1 - bs.t / 1.1,
      len / 3.8, Math.atan2(-bs.dirX, -bs.dirZ)
    );
    if (bs.t <= 0) {
      ctx.effects.markRelease(bs.mark);
      bs.mark = -1;
      bs.state = 'dash';
      bs.t = 2.2;
      e._setEyeAlert(false);
      ctx.bossEvent('charge', e);
    }
    return;
  }

  if (bs.state === 'dash') {
    bs.t -= a.dt;
    a.vx = bs.dirX * COLOSSUS_CHARGE_SPEED;
    a.vz = bs.dirZ * COLOSSUS_CHARGE_SPEED;
    if (a.dist < e.radius + 0.9 && _reachY(a) < BOSS_REACH_Y) {
      ctx.onHitPlayer(Math.min(COLOSSUS_CHARGE_CAP, e.damage), e.pos);
      ctx.effects.addShake(0.3);
      _bossAt.set(e.pos.x, 1.2, e.pos.z);
      ctx.effects.burst(_bossAt, 0xffb300, 24, 7, 2, 0.6);
      bs.state = 'stagger';
      bs.t = 1.2;
      return;
    }
    // Ran into a wall, a pillar or a crate. This is the reward for baiting the
    // charge: a long open window on a body that is otherwise 78% armoured.
    if (e.blockedBy > 0.05 || bs.t <= 0) {
      const slammed = e.blockedBy > 0.05;
      bs.state = 'stagger';
      bs.t = slammed ? 2.5 : 0.8;
      if (slammed) {
        _bossAt.set(e.pos.x, 0, e.pos.z);
        ctx.effects.shockwave(_bossAt, 0xffb300, 7, 0.5);
        ctx.effects.burst(_bossAt, 0xffb300, 34, 8, 3, 0.8);
        ctx.effects.addShake(0.35);
        ctx.bossEvent('stagger', e);
      }
    }
    return;
  }

  // walk
  bs.cd -= a.dt;
  bs.slamCd -= a.dt;
  // Terror does not send a boss running - it just stops it doing anything,
  // which is what fearMode 'stagger' declares on the type.
  if (feared) {
    e._setEyeAlert(false);
    return;
  }

  // VENT FIRE. Only while the core is actually open, and only from `walk` -
  // NOT from `stagger`, which also holds the core open. The stagger is the
  // reward for baiting the charge into a pillar, and it is the one piece of
  // counter-play the fight has; shooting through it would take that back.
  // Gated on range too, so a boss at the far wall is not plinking at someone
  // who has already disengaged.
  if (bs.weakOpen && a.dist < 26) {
    bs.shotCd -= a.dt;
    if (bs.shotCd <= 0) {
      bs.shotCd = COLOSSUS_VENT_SHOT_CD * e.rate;
      const gy = 0.9 * bs.mScale;
      for (let i = -1; i <= 1; i++) {
        ctx.addProjectile(e.pos.x, gy, e.pos.z, 'colossus', 1, i * COLOSSUS_VENT_FAN);
      }
      _bossAt.set(e.pos.x, gy, e.pos.z);
      ctx.effects.burst(_bossAt, 0xff5a00, 10, 4, 1.5, 0.35);
    }
  }

  // Close enough to flatten: a slow, loud, radial slam that punishes standing
  // underneath it rather than circling. Written out rather than run through
  // _meleeCycle because the slam and the charge carry DIFFERENT damage caps,
  // and _meleeCycle can only ever deal e.damage.
  if (bs.slamT > 0) {
    bs.slamT -= a.dt;
    e._setEyeAlert(true);
    if (bs.slamT <= 0) {
      e._setEyeAlert(false);
      bs.slamCd = 3.2 * e.rate;
      if (a.dist < 5.5 && _reachY(a) < BOSS_REACH_Y) {
        ctx.onHitPlayer(Math.min(COLOSSUS_SLAM_CAP, e.damage * 0.82), e.pos);
      }
      _bossAt.set(e.pos.x, 0, e.pos.z);
      ctx.effects.shockwave(_bossAt, 0xff7043, 5.5, 0.4);
      ctx.effects.burst(_bossAt, 0xff7043, 26, 7, 2.5, 0.6);
      ctx.effects.addShake(0.22);
    }
    return;
  }
  if (a.dist < 5 && bs.slamCd <= 0) {
    bs.slamT = 0.9;
    return;
  }

  if (bs.cd <= 0 && a.dist > 8 && a.dist < 26) {
    bs.mark = ctx.effects.markAcquire();
    bs.state = 'tele';
    bs.t = 1.1;
    bs.dirX = a.nx;
    bs.dirZ = a.nz;
    return;
  }

  a.vx = a.px * a.sp;
  a.vz = a.pz * a.sp;
}

// SIEGE. Everything it does is announced: the barrage draws its circles a full
// 1.5s before it lands, and the sweep telegraphs for 0.7s. It is a fight about
// never being where you were a second ago.
const SIEGE_MORTAR_CAP = 34;
const SIEGE_SWEEP_CAP = 46;

function aiSiege(e, a) {
  const bs = e.bs;
  if (bs.salvoCd === undefined) {
    bs.salvoCd = 2;
    bs.sweepCd = 4;
    bs.sweepT = 0;
    bs.mark = -1;
  }
  bs.fx = a.ctx.effects;
  orbit(e, a, ENEMY_TYPES.siege.orbit);
  if (e.status.fear > 0) return;

  // Close-range sweep, so walking up to the artillery is not the answer.
  if (bs.sweepT > 0) {
    bs.sweepT -= a.dt;
    a.vx = 0;
    a.vz = 0;
    e._setEyeAlert(true);
    a.ctx.effects.markSet(bs.mark, e.pos.x, e.pos.z, 8, 0xff5533, 1 - bs.sweepT / 0.7);
    if (bs.sweepT <= 0) {
      e._setEyeAlert(false);
      a.ctx.effects.markRelease(bs.mark);
      bs.mark = -1;
      bs.sweepCd = 5 * e.rate;
      // Frontal half-circle rather than a full ring: getting behind it still
      // works, which is what keeps the sweep a positioning problem.
      if (a.dist < 8 && _reachY(a) < BOSS_REACH_Y) {
        const fx = -Math.sin(e.group.rotation.y);
        const fz = -Math.cos(e.group.rotation.y);
        if (a.nx * fx + a.nz * fz > 0) {
          a.ctx.onHitPlayer(Math.min(SIEGE_SWEEP_CAP, e.damage * 1.36), e.pos);
        }
      }
      _bossAt.set(e.pos.x, 0, e.pos.z);
      a.ctx.effects.shockwave(_bossAt, 0xff5533, 8, 0.4);
      a.ctx.effects.burst(_bossAt, 0xff7043, 28, 8, 2, 0.6);
      a.ctx.effects.addShake(0.25);
    }
    return;
  }
  bs.sweepCd -= a.dt;
  if (a.dist < 7 && bs.sweepCd <= 0) {
    bs.sweepT = 0.7;
    bs.mark = a.ctx.effects.markAcquire();
    return;
  }

  bs.salvoCd -= a.dt;
  if (bs.salvoCd > 0 || a.dist > 34) return;
  bs.salvoCd = 2.4 * e.rate;
  e.flash = 0.15;
  // One more shell per repeat of the rotation. e.cycle is set at spawn.
  const shots = 2 + Math.min(2, e.cycle);
  const p = a.ctx.player;
  for (let i = 0; i < shots; i++) {
    // Led onto where the player is going, and scattered, so running in a
    // straight line is punished but the barrage is never a guaranteed hit.
    a.ctx.addMortar(
      p.pos.x + p.vel.x * 0.45 + (Math.random() - 0.5) * 5,
      p.pos.z + p.vel.z * 0.45 + (Math.random() - 0.5) * 5,
      3.5, 1.5, Math.min(SIEGE_MORTAR_CAP, e.damage * 1.55)
    );
  }
}

// SCHISM. Ordinary melee pressure; the fight is in what happens when the bar
// crosses a threshold. main.js owns the actual split - see _splitBoss - because
// the enemy list and the boss part list both live there.
function aiSchism(e, a) {
  const bs = e.bs;
  if (bs.tier === undefined) bs.tier = 0;
  aiMelee(e, a);
  e.coreMesh.rotation.y += a.dt * 2.5;
  e.ringMesh.rotation.x += a.dt * 1.8;
  // Two thresholds, and each one only ever fires once because the child's
  // health is reset on the way out of _splitBoss.
  if (bs.tier < 2 && e.hp <= e.maxHp * (bs.tier === 0 ? 0.5 : 0.25)) {
    bs.tier++;
    a.ctx.bossEvent('split', e);
  }
}

// MAW. Two pressures at once: a constant drag inward, and rings rolling out
// along the floor that have to be jumped. Neither is survivable by standing
// still, which is the whole design.
const MAW_RING_CAP = 40;
const MAW_TOUCH_CAP = 30;

function aiMaw(e, a) {
  const bs = e.bs;
  if (!bs.rings) {
    bs.rings = [];
    bs.ringCd = 2;
    bs.touchCd = 0;
    bs.mark = -1;
  }
  bs.fx = a.ctx.effects;

  e.ringA.rotation.z += a.dt * 2.2;

  // The drag, every frame, falling off with distance. Capped in main.js well
  // under the player's own speed: running out has to stay possible.
  if (a.dist < 22 && e.status.fear <= 0) {
    a.ctx.pullPlayer(-a.nx, -a.nz, 4.2 * (1 - a.dist / 22) * (e.damage / 26));
  }

  // Rings roll outward and damage anyone standing on the ground as they pass.
  for (let i = bs.rings.length - 1; i >= 0; i--) {
    const r = bs.rings[i];
    r.r += 9 * a.dt;
    r.life -= a.dt;
    // Low fill so it reads as a travelling RING rather than a filled disc -
    // the edge is the part that hurts.
    a.ctx.effects.markSet(r.mark, e.pos.x, e.pos.z, r.r, 0x7c4dff, 0.15);
    const pd = Math.hypot(a.ctx.player.pos.x - e.pos.x, a.ctx.player.pos.z - e.pos.z);
    // Only catches a player on the ground: the jump gives about 0.8s of air
    // against a ring moving 9 m/s, which clears it comfortably if it is timed.
    if (!r.hit && Math.abs(pd - r.r) < 0.7 && a.ctx.player.pos.y < 0.6) {
      r.hit = true;
      a.ctx.onHitPlayer(Math.min(MAW_RING_CAP, e.damage * 1.54), a.ctx.player.pos);
    }
    if (r.life <= 0 || r.r > 24) {
      a.ctx.effects.markRelease(r.mark);
      bs.rings.splice(i, 1);
    }
  }

  bs.ringCd -= a.dt;
  if (bs.ringCd <= 0 && bs.rings.length < 3 && e.status.fear <= 0) {
    bs.ringCd = 3.2 * e.rate;
    const mk = a.ctx.effects.markAcquire();
    if (mk >= 0) bs.rings.push({ r: 1.5, life: 2.6, hit: false, mark: mk });
    _bossAt.set(e.pos.x, 0, e.pos.z);
    a.ctx.effects.burst(_bossAt, 0x7c4dff, 18, 4, 1.5, 0.6);
  }

  // Slow, and it barely chases - the pull is what closes the distance. Touch
  // damage exists only so it cannot be hugged while the rings pass overhead.
  bs.touchCd -= a.dt;
  if (a.dist < 4 && _reachY(a) < BOSS_REACH_Y && bs.touchCd <= 0) {
    bs.touchCd = 1.4 * e.rate;
    a.ctx.onHitPlayer(Math.min(MAW_TOUCH_CAP, e.damage * 0.77), e.pos);
    a.ctx.effects.addShake(0.15);
  }
  if (e.status.fear > 0) return;
  a.vx = a.px * a.sp;
  a.vz = a.pz * a.sp;
}

// HERALD. Blink, volley, pools, and a one-way enrage under 30% that shortens
// every cooldown at once.
const HERALD_POOL_CAP = 20;

function aiHerald(e, a) {
  const bs = e.bs;
  if (bs.volleyCd === undefined) {
    bs.volleyCd = 2;
    bs.blinkCd = 4;
    bs.poolCd = 3;
    bs.enraged = false;
  }
  orbit(e, a, ENEMY_TYPES.herald.orbit);
  e.ringA.rotation.z += a.dt * (bs.enraged ? 4 : 1.8);
  if (e.status.fear > 0) return;

  // One way, once. The fight should get harder as it ends, not easier.
  if (!bs.enraged && e.hp <= e.maxHp * 0.3) {
    bs.enraged = true;
    e.rate *= 0.6;
    e.speed *= 1.25;
    e.bodyMat.emissiveIntensity = 0.8;
    a.ctx.bossEvent('enrage', e);
    _bossAt.set(e.pos.x, 1.4, e.pos.z);
    a.ctx.effects.burst(_bossAt, 0xffd54f, 40, 8, 3, 0.9);
    a.ctx.effects.addShake(0.35);
  }

  bs.blinkCd -= a.dt;
  if (bs.blinkCd <= 0) {
    bs.blinkCd = 5 * e.rate;
    // Re-placed on a ring around the player rather than anywhere: it should
    // keep changing the angle of the fight without ever landing on top of them.
    for (let tries = 0; tries < 8; tries++) {
      const ang = Math.random() * Math.PI * 2;
      const rad = 10 + Math.random() * 4;
      const tx = a.ctx.player.pos.x + Math.cos(ang) * rad;
      const tz = a.ctx.player.pos.z + Math.sin(ang) * rad;
      const B = 21.6 - (e.radius - 0.5);
      _bossAt.set(tx, 0.5, tz);
      if (Math.abs(tx) > B || Math.abs(tz) > B) continue;
      if (pointInObstacle(_bossAt, a.ctx.obstacles)) continue;
      _bossAt.set(e.pos.x, 1.2, e.pos.z);
      a.ctx.effects.burst(_bossAt, 0xffd54f, 24, 6, 2, 0.6);
      e.pos.x = tx;
      e.pos.z = tz;
      resolveCircle(e.pos, e.radius, a.ctx.obstacles, e.collideH);
      _bossAt.set(e.pos.x, 1.2, e.pos.z);
      a.ctx.effects.burst(_bossAt, 0xffd54f, 24, 6, 2, 0.6);
      break;
    }
  }

  bs.volleyCd -= a.dt;
  if (bs.volleyCd <= 0 && a.dist < 26) {
    bs.volleyCd = 3 * e.rate;
    e.flash = 0.15;
    // Five of the forty enemy projectile slots; the other eight in the pool are
    // reserved for the player's own shards and can never be taken here.
    const shots = bs.enraged ? 7 : 5;
    for (let i = 0; i < shots; i++) {
      a.ctx.addProjectile(e.pos.x, 1.6, e.pos.z, 'shooter', e._projScale());
    }
  }

  bs.poolCd -= a.dt;
  if (bs.poolCd <= 0 && a.dist < 24) {
    bs.poolCd = 4.5 * e.rate;
    const p = a.ctx.player;
    for (let i = 0; i < 2; i++) {
      a.ctx.addHazard(
        p.pos.x + (Math.random() - 0.5) * 4,
        p.pos.z + (Math.random() - 0.5) * 4,
        3.0, 5, Math.min(HERALD_POOL_CAP, e.damage * 0.6)
      );
    }
  }
}

// Scratch for boss effects, reused like every other vector in this file.
const _bossAt = new THREE.Vector3();

// Scratch for the blink and for the drips the new types spawn. Module-level
// and consumed immediately, like _dripAt and _steer above.
const _blinkFwd = new THREE.Vector3();
const _blinkAt = new THREE.Vector3();

// The one AI frame object, filled and handed to an ai() per enemy per frame.
// Reused rather than allocated: thirty enemies at 60fps is 1800 objects a
// second, which is exactly the kind of churn the geometry and material caches
// in this file exist to avoid.
const _a = {
  dt: 0, ctx: null, dist: 0, nx: 0, nz: 0, px: 0, pz: 0, sp: 0, vx: 0, vz: 0,
};

export class Enemy {
  constructor(type, pos, hpScale, speedScale, dmgScale) {
    const def = ENEMY_TYPES[type];
    const s = def.scale;
    this.id = ++idSeq;
    // Crowd bob state - see the dance block in update(). `danceLag` staggers
    // this enemy's response to the beat so a room full of them reads as a
    // crowd rather than a chorus line; it is derived from the id so it is
    // stable for the enemy's whole life and costs no storage to randomise.
    this._dance = 0;
    this.danceLag = (this.id % 7) / 7;
    // Weight-shift state. `_leanSign` flips on every beat so the lean
    // alternates sides; `_lean` chases it so the change is a shift rather
    // than a snap, and `_beatHigh` is the edge detector that does the flip.
    this._lean = 0;
    this._leanSign = this.id % 2 ? 1 : -1;
    this._beatHigh = false;
    this.type = type;
    this.maxHp = def.hp * hpScale;
    this.hp = this.maxHp;
    this.speed = def.speed * speedScale;
    this.damage = def.damage * dmgScale;
    this.score = def.score;
    // Collision size, independent of the model's `scale`. Everything that
    // treats an enemy as a circle reads this: obstacle resolution, crowd
    // separation, the arena clamp, melee reach and the player's shards.
    this.radius = def.radius ?? 0.5;
    // Heavy things are not pushed around. Knockback, Gravity Rounds and the
    // player's shockwave all write e.pos directly, and a boss that could be
    // shoved out of its own charge would not be a fight.
    this.immovable = (def.mass ?? 1) >= 4;
    this.boss = !!def.boss;
    // How tall this thing is for the purpose of overhead geometry. A boss does
    // not fit under a catwalk; everything else does. See AGENT_HEIGHT.
    this.collideH = def.boss ? BOSS_HEIGHT : AGENT_HEIGHT;
    // Status resistance. The defaults are exactly what every enemy did before
    // bosses existed, so the original six are unchanged by all of this.
    this.statusMul = def.statusMul ?? 1;
    this.slowFactor = def.slowFactor ?? SLOW_FACTOR;
    this.freezeVuln = def.freezeVuln ?? FREEZE_VULN;
    // Conduit's aura, in seconds remaining. Refreshed by a live conduit every
    // frame and counted down in _tickStatus, so it lapses on its own the frame
    // after the conduit dies - no reference to clean up.
    this.buffT = 0;
    // Warden's dome, in seconds remaining. Same refresh-and-lapse contract as
    // buffT above; while it is positive this enemy cannot be damaged at all.
    this.wardT = 0;
    this.colorHex = def.color;
    this.eyeBase = def.eye;
    this.pos = pos.clone();
    this.attackCd = 0.8 + Math.random();
    this.windup = 0;
    this.strafe = Math.random() < 0.5 ? 1 : -1;
    this.strafeT = 1 + Math.random() * 2;
    // Wraith's teleport timer. Staggered at birth so a group that spawned
    // together does not blink in unison.
    this.blinkCd = 1.5 + Math.random() * 2.5;
    // Attack-cooldown multiplier. 1 for everything except a boss, where
    // waves.js turns it down with the wave number so late fights come at the
    // player faster rather than merely lasting longer.
    this.rate = 1;
    // Which pass through the boss rotation this is - 0 the first time a boss
    // is met, 1 from wave 26 on. Bosses scale by stats, but a couple of them
    // read this to add a shell or a volley rather than only bigger numbers.
    this.cycle = 0;
    this.blockedBy = 0;
    // Scratch for a boss's own phase state, allocated only for bosses so an
    // ordinary wave does not pay for an object per enemy.
    this.bs = def.boss ? {} : null;
    this.flash = 0;
    this.dead = false;
    this._flashOn = false;
    this._eyeAlert = false;
    // Status timers, seconds remaining. Every key in STATUS_ORDER is present
    // from birth so the tick never has to test for existence.
    this.status = { freeze: 0, burn: 0, poison: 0, slow: 0, fear: 0 };
    // Damage-over-time rates, kept per source so a player carrying both Venom
    // and Incendiary gets both, rather than the larger of the two.
    this._dps = { poison: 0, burn: 0 };
    this._dotAcc = 0;
    // One drip timer per status, so each effect keeps its own rhythm instead
    // of every status on an enemy puffing on the same frame.
    this._dripAcc = { freeze: 0, burn: 0, poison: 0, slow: 0, fear: 0 };
    // Last emissive colour written to bodyMat, so the tick can skip the
    // setHex() when nothing changed.
    this._tintHex = def.color;
    // What the body is currently WEARING - 'flash', 'ward' or a tint hex - so
    // _applyBodyLook can skip the material writes when nothing has changed.
    this._look = def.color;
    // Per-status re-application lockout, used only by status-resistant types
    // so a continuous stream of hits cannot hold one permanently afflicted.
    this._statusCd = { freeze: 0, burn: 0, poison: 0, slow: 0, fear: 0 };
    // Any material a build() allocates per instance goes here and is freed in
    // dispose(). The body and eye materials are handled separately because
    // every enemy has exactly one of each.
    this._extraMats = [];

    this.group = new THREE.Group();
    // YXZ so the dance's roll (rotation.z, in update) composes INSIDE the
    // facing yaw: the enemy leans about its own spine rather than tipping
    // toward a fixed world axis as it turns. Nothing writes rotation.x, and
    // the places that read rotation.y for a facing direction are unaffected -
    // the order only changes how y and z combine.
    this.group.rotation.order = 'YXZ';
    this.group.position.copy(this.pos);
    // flatShading is what makes the whole roster read as cut facets. Every
    // part of every silhouette shares this one material, so a hit flash and a
    // status tint land on the entire body at once - see partsFor().
    this.bodyMat = new THREE.MeshStandardMaterial({
      color: def.color, roughness: 0.4, metalness: 0.3, flatShading: true,
      emissive: def.color, emissiveIntensity: BODY_BASE_INTENSITY,
    });
    this.eyeMat = new THREE.MeshBasicMaterial({ color: def.eye });

    // The type builds its OWN model, silhouette included. There is deliberately
    // no shared body here: one capsule for every type was what made the roster
    // read as the same blob in different colours.
    (def.build || buildChaser)(this, this.group, s);

    // A type may override the hit sphere when its silhouette is nothing like
    // the usual upright body - the bosses all do. The geometry is still cached
    // per type, never per instance.
    const hb = def.hitbox;
    this.hitbox = new THREE.Mesh(
      hb
        ? geo('hitbox:' + type, () => new THREE.SphereGeometry(hb.r, 10, 10))
        : geo('hitbox', () => new THREE.SphereGeometry(0.6, 8, 8)),
      SHARED_MATS.hitbox
    );
    this.hitbox.position.y = (hb ? hb.y : 0.8) * s;
    // Scale the hitbox with the model so big enemies are as easy to hit as they look.
    this.hitbox.scale.setScalar(s);
    this.hitbox.userData.enemy = this;
    this.group.add(this.hitbox);
    this.group.updateMatrixWorld(true);
  }

  _setFlash(on) {
    if (this._flashOn === on) return;
    this._flashOn = on;
    this._applyBodyLook();
  }

  // THE BODY HAS ONE WRITER. The hit flash, the warden's stone and the status
  // tint all want the same two material properties, and three separate setters
  // is how a flash used to erase a status tint until the next status change
  // put it back. They are a strict priority instead:
  //
  //   flash   the hit landed - always wins, and lasts a tenth of a second
  //   ward    a warden is protecting this enemy: it cannot be damaged, and it
  //           goes stone grey in the COLOUR channel as well as the emissive,
  //           so it stops looking like a thing worth shooting at all
  //   status  poison, fire, ice - the tint the mutations put on it
  //   base    its own colour
  //
  // `_look` is what is currently on the material, so a frame that changes
  // nothing writes nothing.
  _applyBodyLook() {
    const want = this._flashOn ? 'flash' : this.wardT > 0 ? 'ward' : this._dominantTint();
    if (want === this._look) return;
    this._look = want;
    if (want === 'flash') {
      this.bodyMat.color.setHex(this.colorHex);
      this.bodyMat.emissive.setHex(BODY_FLASH_HEX);
      this.bodyMat.emissiveIntensity = BODY_FLASH_INTENSITY;
      return;
    }
    if (want === 'ward') {
      // The base colour goes too, not just the glow. An enemy that was still
      // its own bright red under a grey sheen read as "tinted", and the whole
      // job of this state is to read as "made of rock".
      this.bodyMat.color.setHex(WARD_STONE);
      this.bodyMat.emissive.setHex(WARD_STONE);
      this.bodyMat.emissiveIntensity = 0.45;
      return;
    }
    this._tintHex = want;
    this.bodyMat.color.setHex(this.colorHex);
    this.bodyMat.emissive.setHex(want);
    this.bodyMat.emissiveIntensity =
      want === this.colorHex ? BODY_BASE_INTENSITY : STATUS_INTENSITY;
  }

  // The colour this enemy should be wearing right now: the highest-priority
  // active status, or its own colour when it is clean.
  _dominantTint() {
    for (const k of STATUS_ORDER) {
      if (this.status[k] > 0) return STATUS_TINT[k];
    }
    return this.colorHex;
  }

  /**
   * Applies a status effect. REFRESHES rather than stacks - see STATUS_ORDER.
   *
   * @param {string} kind  a key of STATUS_TINT
   * @param {number} dur   seconds; the longer of this and what is already on
   * @param {number} power damage per second, for 'poison' and 'burn' only
   */
  applyStatus(kind, dur, power = 0) {
    if (this.dead || !(kind in this.status)) return;
    // RESISTANCE. Only types that ask for it are affected; at statusMul 1 with
    // no freezeSlow this whole block is skipped and the method behaves exactly
    // as it always has.
    if (this.statusMul < 1) {
      // A boss that can be stopped outright is not a fight - a three second
      // Petrify would be a free damage window on every magazine. Freeze
      // becomes a heavy slow instead, so the mutation still does something.
      if (kind === 'freeze' && ENEMY_TYPES[this.type].freezeSlow) {
        kind = 'slow';
        dur *= 0.6;
      }
      dur *= this.statusMul;
      // At eight shots a second, refreshing on every hit would hold a boss
      // slowed for the entire fight. The lockout makes the status roughly a
      // 50% uptime effect rather than a permanent one.
      if (this._statusCd[kind] > 0) return;
      this._statusCd[kind] = dur * 2;
    }
    this.status[kind] = Math.max(this.status[kind], dur);
    if (power > 0 && kind in this._dps) this._dps[kind] = Math.max(this._dps[kind], power);
  }

  // Movement speed after Cryo and Petrify. Every speed read inside update()
  // goes through this - a branch that used this.speed directly would keep
  // moving at full pace while visibly frozen.
  _effSpeed() {
    if (this.status.freeze > 0) return 0;
    const buff = this.buffT > 0 ? CONDUIT_SPEED : 1;
    return (this.status.slow > 0 ? this.speed * this.slowFactor : this.speed) * buff;
  }

  // Cryo slows the shots a slowed enemy fires as well as the enemy: a sniper
  // that still snapped a full-speed round out would read as unaffected.
  _projScale() {
    return this.status.slow > 0 ? 0.6 : 1;
  }

  // One status step: run the timers down, tick damage over time, keep the tint
  // current and drip a couple of particles. Called at the top of update().
  _tickStatus(dt, ctx) {
    let any = false;
    // Entropy. Under the threshold the timers simply stop running: what is
    // already on an enemy stays on it until it dies. It is deliberately a
    // hold rather than a refresh, so it can never apply a status the player
    // did not put there.
    // Entropy stops the timers below a health threshold, which on a normal
    // enemy is the whole point of the mutation and on a boss would mean a
    // permanent lock for the back third of the fight. Resistant types opt out.
    const held = !ENEMY_TYPES[this.type].entropyExempt
      && ctx.mods && ctx.mods.entropyBelow > 0
      && this.hp <= this.maxHp * ctx.mods.entropyBelow;
    if (this.buffT > 0) this.buffT -= dt;
    if (this.wardT > 0) this.wardT -= dt;
    if (this.statusMul < 1) {
      for (const k of STATUS_ORDER) {
        if (this._statusCd[k] > 0) this._statusCd[k] -= dt;
      }
    }
    for (const k of STATUS_ORDER) {
      if (this.status[k] <= 0) continue;
      if (held) {
        any = true;
        continue;
      }
      this.status[k] -= dt;
      if (this.status[k] <= 0) {
        this.status[k] = 0;
        if (k in this._dps) this._dps[k] = 0;
      } else {
        any = true;
      }
    }

    // Damage accrues as a float and is dealt in whole points, so a 12 dps
    // poison is twelve separate ticks a second rather than a fractional nibble
    // every frame. `silent` keeps it from firing the white hit flash, which
    // would strobe over the status tint for as long as the status lasts.
    const dps = (this.status.poison > 0 ? this._dps.poison : 0)
      + (this.status.burn > 0 ? this._dps.burn : 0);
    if (dps > 0) {
      this._dotAcc += dps * dt;
      if (this._dotAcc >= 1) {
        const whole = Math.floor(this._dotAcc);
        this._dotAcc -= whole;
        this.takeDamage(whole, true);
        if (this.dead) return;
      }
    }

    this._applyBodyLook();

    if (!any || !ctx.effects) return;
    // One drip per ACTIVE status, each on its own timer and in its own colour.
    // Spawn heights come from STATUS_FX so a rising effect starts low on the
    // body and a falling one starts high - a drip that began at the feet would
    // be hidden by the enemy itself from anywhere but point blank.
    for (const k of STATUS_ORDER) {
      if (this.status[k] <= 0) continue;
      const fx = STATUS_FX[k];
      this._dripAcc[k] += dt;
      if (this._dripAcc[k] < fx.interval) continue;
      this._dripAcc[k] = 0;
      // Spread across the body rather than all from one point, or the drip
      // reads as a single jet coming out of the enemy's chest.
      _dripAt.set(
        this.pos.x + (Math.random() - 0.5) * 0.5,
        fx.y + (Math.random() - 0.5) * 0.3,
        this.pos.z + (Math.random() - 0.5) * 0.5
      );
      ctx.effects.burst(_dripAt, STATUS_TINT[k], fx.count, fx.speed, fx.up, fx.life);
    }
  }

  _setEyeAlert(on) {
    if (this._eyeAlert === on) return;
    this._eyeAlert = on;
    this.eyeMat.color.setHex(on ? 0xffffff : this.eyeBase);
  }

  // How far above an enemy the player can be and still be hit by a melee
  // swing. `dist` is measured on the XZ plane only - the whole game collides
  // in 2D - so without this a rusher on the floor would land hits on a player
  // standing on a catwalk four metres over its head. Generous enough to still
  // cover the raised platforms, which are well inside a swing's reach.
  static MELEE_REACH_Y = 2.4;

  // Wind up a melee swing, then land it if the player is still in range.
  _meleeCycle(dt, dist, ctx, windupTime, startRange, hitRange, cooldown) {
    const dy = Math.abs(ctx.player.pos.y - this.pos.y);
    if (this.windup > 0) {
      this.windup -= dt;
      this._setEyeAlert(true);
      if (this.windup <= 0) {
        this._setEyeAlert(false);
        if (dist < hitRange && dy < Enemy.MELEE_REACH_Y) ctx.onHitPlayer(this.damage, this.pos);
        this.attackCd = cooldown;
      }
      return false;
    }
    this._setEyeAlert(false);
    if (dist < startRange && dy < Enemy.MELEE_REACH_Y && this.attackCd <= 0) {
      this.windup = windupTime;
      return false;
    }
    return true;
  }

  // One AI + movement step. Computes a desired velocity for this frame, adds
  // crowd separation, clamps it, moves, then resolves against obstacles.
  update(dt, ctx) {
    if (this.dead) return;
    this._tickStatus(dt, ctx);
    if (this.dead) return;   // a damage-over-time tick can finish it off
    const sp = this._effSpeed();
    const p = ctx.player.pos;
    const dx = p.x - this.pos.x;
    const dz = p.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const inv = 1 / Math.max(dist, 0.001);
    const nx = dx * inv;
    const nz = dz * inv;
    this.attackCd -= dt;

    // Walking heading: around the level rather than into it. Falls back to the
    // straight line when there is no grid, or no route through it.
    let px = nx;
    let pz = nz;
    // Wide bodies steer on the grid cut for them, so they are not routed
    // through gaps they cannot fit through.
    const nav = this.radius > 0.8 ? (ctx.navBig || ctx.nav) : ctx.nav;
    if (nav && nav.steer(this.pos.x, this.pos.z, _steer)) {
      px = _steer.x;
      pz = _steer.z;
    }

    let vx = 0;
    let vz = 0;

    if (this.status.freeze > 0) {
      // Petrified: no movement, no attack, and any half-wound swing is lost.
      this.windup = 0;
      this._setEyeAlert(false);
    } else if (this.status.fear > 0 && ENEMY_TYPES[this.type].fearMode !== 'stagger') {
      // Terror: run from the player and do not attack. sp is unchanged, so a
      // feared enemy retreats as fast as it would have advanced.
      //
      // A boss opts out with fearMode 'stagger'. Sending one running for the
      // far wall does not read as terror, it reads as the fight pausing - so
      // it falls through to its own ai(), which checks status.fear itself and
      // holds position without attacking.
      this.windup = 0;
      this._setEyeAlert(false);
      vx = -nx * sp;
      vz = -nz * sp;
    } else {
      // The type's own behaviour. A type with no ai() is inert on purpose -
      // `conduit` has no attack - which is also what the original chain did
      // with a type it had no branch for.
      _a.dt = dt;
      _a.ctx = ctx;
      _a.dist = dist;
      _a.nx = nx;
      _a.nz = nz;
      _a.px = px;
      _a.pz = pz;
      _a.sp = sp;
      _a.vx = 0;
      _a.vz = 0;
      const def = ENEMY_TYPES[this.type];
      if (def.ai) def.ai(this, _a);
      vx = _a.vx;
      vz = _a.vz;
    }

    // Push apart from crowding neighbours (squared test first to skip the sqrt).
    // Sized off both radii, so a big enemy keeps a big berth. For two
    // ordinary enemies rr is 1.0 and the push is 2.2 - the same numbers this
    // used when every enemy was the same size.
    for (const o of ctx.enemies) {
      if (o === this) continue;
      const ox = this.pos.x - o.pos.x;
      const oz = this.pos.z - o.pos.z;
      const d2 = ox * ox + oz * oz;
      const rr = this.radius + o.radius;
      if (d2 < rr * rr && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        // A heavy enemy is not shoved aside by the crowd it is wading through.
        const push = o.immovable && !this.immovable ? 4.4 : this.immovable ? 0 : 2.2;
        vx += (ox / d) * push * rr;
        vz += (oz / d) * push * rr;
      }
    }

    const step = Math.hypot(vx, vz);
    const maxStep = sp * 1.4;
    if (step > maxStep) {
      const k = maxStep / step;
      vx *= k;
      vz *= k;
    }
    this.pos.x += vx * dt;
    this.pos.z += vz * dt;
    // Pulled in by however much wider than standard this enemy is, so a big
    // body stops at the wall rather than half inside it.
    const B = 21.6 - (this.radius - 0.5);
    // Kept from before the clamp: a charging boss needs to know the WALL
    // stopped it, and after the clamp there is nothing left to compare.
    const preX = this.pos.x;
    const preZ = this.pos.z;
    this.pos.x = Math.max(-B, Math.min(B, this.pos.x));
    this.pos.z = Math.max(-B, Math.min(B, this.pos.z));
    const hitWall = preX !== this.pos.x || preZ !== this.pos.z;
    const ix = this.pos.x;
    const iz = this.pos.z;
    resolveCircle(this.pos, this.radius, ctx.obstacles, this.collideH);
    // Distance collision had to move it back this frame, walls included. A
    // charging boss reads it to know it slammed into something, which is
    // cheaper and more reliable than any extra geometry: the obstacle test has
    // already done the work.
    this.blockedBy = Math.hypot(this.pos.x - ix, this.pos.z - iz) + (hitWall ? 1 : 0);

    // THE CROWD DANCES. This is written to group.position, never to this.pos,
    // so it is invisible to pathfinding, collision and the nav grid - all of
    // which read this.pos. The hitbox IS parented to the group and so bobs
    // with the model, which is what keeps shots landing where the enemy looks
    // like it is; that also means the amplitudes below are a real (small)
    // change to how hard a target is to hit, which is why they are small.
    //
    // Each beat is a hop that decays before the next one lands, rather than a
    // sine at some guessed tempo: the hop follows the music's own onsets, so
    // it stays in time through a tempo change or a breakdown. `danceLag`
    // spreads the responses out over a few frames so they do not all pop on
    // the same one - in unison it reads as a stutter, not a dance.
    //
    // A boss hops a third as high. Something that size travelling as far as a
    // rusher reads as weightless rather than heavy.
    //
    // The lag holds `_dance` below 1, so the measured hop is about 0.12 for a
    // rusher and 0.04 for a boss - visible across the arena, and small against
    // a hitbox radius of 0.5 to 0.72.
    const amp = this.boss ? 0.06 : 0.18;
    const lag = 15 - this.danceLag * 7;
    this._dance += (ctx.beat - this._dance) * Math.min(1, dt * lag);
    // A slow sway underneath, so an enemy is never perfectly still between
    // beats and a silent passage still leaves the crowd swaying.
    const sway = Math.sin(ctx.time * 1.8 + this.id) * 0.022 * (0.4 + ctx.level);
    const bob = this.status.freeze > 0 ? 0 : this._dance * amp + sway;
    this.group.position.set(this.pos.x, bob, this.pos.z);
    this.group.rotation.y = Math.atan2(-dx, -dz);

    // THE WEIGHT SHIFT. Bouncing straight up and down reads as bobbing; what
    // makes it read as DANCING is the weight going side to side, so the lean
    // alternates on every beat.
    //
    // The side is flipped by an edge detector on the beat envelope rather than
    // by an oscillator at some assumed tempo, so it stays locked to the music
    // for free and needs no idea of what the BPM is.
    //
    // The group's Euler order is YXZ (set in the constructor), which puts this
    // roll INSIDE the yaw: the enemy leans about its own spine whichever way
    // it happens to be facing, instead of tipping toward a fixed world axis.
    const high = ctx.beat > 0.6;
    if (high && !this._beatHigh) this._leanSign = -this._leanSign;
    this._beatHigh = high;
    this._lean += (this._leanSign - this._lean) * Math.min(1, dt * 7);
    // Sized against the hitbox, not by eye. The hitbox is parented to the
    // group but sits at local y ~0.8, NOT at the origin, so a roll of theta
    // slides it sideways by sin(theta)*0.8. At the peak here that is about
    // 0.09 - under a fifth of the smallest hitbox radius - which keeps the
    // lean honest against a sphere the player is trying to hit.
    // Barely perceptible on a boss, for the same reason its hop is small.
    const leanAmp = this.boss ? 0.07 : 0.26;
    this.group.rotation.z = this.status.freeze > 0
      ? 0
      : this._lean * leanAmp * (0.45 + this._dance * 0.55);

    if (this.flash > 0) this.flash -= dt;
    this._setFlash(this.flash > 0);
  }

  // Returns true if this hit killed the enemy. Only sets `dead`; main.js does
  // the actual removal on its next sweep.
  //
  // `silent` skips the white hit flash. Damage over time calls this many times
  // a second, and a flash on every tick would bury the status tint that is the
  // whole visual tell for poison and fire.
  takeDamage(d, silent = false, dirX = 0, dirZ = 0) {
    if (this.dead) return false;
    // A warded enemy takes NOTHING - not bullets, not blasts, not the damage
    // over time already ticking on it. A partial reduction here would leave
    // the player unsure whether their shots were working, which is the one
    // thing the warden must never be ambiguous about.
    if (this.wardT > 0) return false;
    if (this.status.freeze > 0) d *= this.freezeVuln;
    // ARMOUR. `dirX, dirZ` is the direction the hit TRAVELLED, which is what
    // decides whether it landed on a shield or a weak point. Callers that have
    // no direction to give - damage over time, blasts, ash - pass nothing and
    // get armorDefault, and each type chooses what that means: a Bulwark's
    // shield does not stop poison (armorDefault 1) while a Colossus's plating
    // does (armorDefault 0.22).
    const def = ENEMY_TYPES[this.type];
    if (def.armor) d *= (dirX || dirZ) ? def.armor(this, dirX, dirZ) : def.armorDefault;
    if (this.buffT > 0) d *= CONDUIT_RESIST;
    this.hp -= d;
    if (!silent) this.flash = 0.12;
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      return true;
    }
    return false;
  }

  // Frees the two per-instance materials. Geometries and the remaining
  // materials are shared and intentionally kept for the next enemy.
  dispose() {
    // A boss killed mid-telegraph is still holding a mark from the effects
    // pool, and that pool is only ten deep - leaking one every fight would
    // eventually leave later bosses unable to warn the player at all.
    const def = ENEMY_TYPES[this.type];
    if (def.cleanup) def.cleanup(this);
    this.bodyMat.dispose();
    this.eyeMat.dispose();
    for (const m of this._extraMats) m.dispose();
    this._extraMats.length = 0;
    this.hitbox.userData.enemy = null;
  }
}

// ---- projectiles ---------------------------------------------------------
// Same story as enemies: one geometry and one material set per projectile
// type, reused for every shot fired.
const PROJ_COLORS = {
  shooter: { core: 0xd08bff, glow: 0xb14aed, scale: 0.75 },
  sniper: { core: 0x88ffcc, glow: 0x00ff88, scale: 0.5 },
  // The blight's spit and the pool it leaves wear the same toxic green, so the
  // glob in the air and the patch it becomes are obviously one thing.
  blight: { core: 0xd6ff8a, glow: 0xaaff2a, scale: 1.3 },
  // Colossus fires only through its open vent, so the round wears the core's
  // own heat rather than the generic shooter purple.
  colossus: { core: 0xffd08a, glow: 0xff5a00, scale: 1.1 },
};
const projMats = new Map();

function projectileMats(type, glowTex) {
  let m = projMats.get(type);
  if (!m) {
    const c = PROJ_COLORS[type] || PROJ_COLORS.shooter;
    m = {
      core: new THREE.MeshBasicMaterial({ color: c.core }),
      glow: new THREE.SpriteMaterial({
        map: glowTex, color: c.glow, transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
      scale: c.scale,
    };
    projMats.set(type, m);
  }
  return m;
}

let grenadeMats = null;
function grenadeMaterials(glowTex) {
  if (!grenadeMats) {
    grenadeMats = {
      core: new THREE.MeshStandardMaterial({
        color: 0xff4400, emissive: 0xff4400, emissiveIntensity: 1.5, roughness: 0.3, metalness: 0.5,
      }),
      glow: new THREE.SpriteMaterial({
        map: glowTex, color: 0xff6600, transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    };
  }
  return grenadeMats;
}

const _tmpTarget = new THREE.Vector3();

// Straight-line enemy shot. update() returns 'alive', 'hit' (reached the
// player), 'wall' (hit geometry or the floor) or 'expired'; main.js removes it
// from the scene on anything but 'alive'.
export class Projectile {
  constructor(scene, glowTex, x, y, z, target, speed, damage, type = 'shooter') {
    this.pos = new THREE.Vector3(x, y, z);
    this.vel = new THREE.Vector3(target.x - x, target.y - y, target.z - z).normalize().multiplyScalar(speed);
    this.speed = speed;
    this.damage = damage;
    this.life = 4;
    this.type = type;

    const mats = projectileMats(type, glowTex);
    this.mesh = new THREE.Mesh(geo('projectile', () => new THREE.SphereGeometry(0.1, 8, 8)), mats.core);
    const sp = new THREE.Sprite(mats.glow);
    sp.scale.setScalar(mats.scale);
    this.mesh.add(sp);
    this.mesh.position.copy(this.pos);
    scene.add(this.mesh);
  }

  update(dt, ctx) {
    this.life -= dt;
    if (this.life <= 0) return 'expired';
    this.pos.addScaledVector(this.vel, dt);
    this.mesh.position.copy(this.pos);
    if (this.pos.distanceTo(ctx.player.eyeInto(_tmpTarget)) < 0.7) {
      ctx.onHitPlayer(this.damage, this.pos);
      return 'hit';
    }
    if (this.pos.y <= 0.03) return 'wall';
    if (pointInObstacle(this.pos, ctx.obstacles)) return 'wall';
    return 'alive';
  }
}

// The blight's spit. A lobbed glob that leaves a creep pool WHERE IT LANDS,
// which is the whole point of it existing: the pool used to appear under the
// player with nothing in the air to warn them.
//
// Ballistic rather than straight, and the arc is solved at spawn (see
// _spawnSpit) rather than fired at a fixed elevation like Grenade: a glob that
// visibly climbs, hangs and falls is readable from anywhere in the arena,
// including from directly underneath, where a flat shot is a dot that does not
// move. Horizontal speed is constant, so flight time scales with range and a
// far-off blight telegraphs itself for over a second.
//
// It deals NO impact damage. The blight's own `damage` is 0 and always has
// been - it is a zoner, the pool is the entire threat, and giving the glob a
// hit would quietly rewrite that enemy's role.
export class Spit {
  constructor(scene, glowTex, x, y, z, vx, vy, vz, radius, life, dps) {
    this.pos = new THREE.Vector3(x, y, z);
    this.vel = new THREE.Vector3(vx, vy, vz);
    this.radius = radius;
    this.poolLife = life;
    this.dps = dps;
    this.life = 5;
    this.type = 'blight';

    const mats = projectileMats('blight', glowTex);
    this.mesh = new THREE.Mesh(geo('spit', () => new THREE.SphereGeometry(0.22, 8, 8)), mats.core);
    const sp = new THREE.Sprite(mats.glow);
    sp.scale.setScalar(mats.scale);
    this.mesh.add(sp);
    this.mesh.position.copy(this.pos);
    scene.add(this.mesh);
  }

  update(dt, ctx) {
    this.life -= dt;
    if (this.life <= 0) return 'expired';
    this.vel.y -= 22 * dt;
    this.pos.addScaledVector(this.vel, dt);
    this.mesh.position.copy(this.pos);
    // Wobbles as it flies. A perfect sphere on a perfect parabola reads as a
    // UI marker; a tumbling lump reads as something an animal spat.
    this.mesh.rotation.x += dt * 6;
    this.mesh.rotation.y += dt * 4;

    // Only the FLOOR and obstacle tops grow creep. A glob that clipped a wall
    // mid-flight has nothing to pool on, so it just splashes.
    if (this.pos.y <= 0.12) {
      this.pos.y = 0.12;
      this._land(ctx);
      return 'landed';
    }
    if (pointInObstacle(this.pos, ctx.obstacles)) {
      this._land(ctx);
      return 'landed';
    }
    return 'alive';
  }

  _land(ctx) {
    if (ctx.addHazard) ctx.addHazard(this.pos.x, this.pos.z, this.radius, this.poolLife, this.dps);
    if (ctx.effects) ctx.effects.burst(this.pos, 0xaaff2a, 14, 4, 2, 0.45);
  }
}

// Reload Burst's shard. The one projectile the PLAYER owns: it flies flat and
// outward, explodes on an enemy, an obstacle or a short fuse, and cannot hurt
// the player - that is the whole promise of the upgrade, so there is no
// player-damage branch here to get wrong later.
//
// Damage is dealt through ctx.onBlast rather than inline: radial falloff and
// the enemy list both live in main.js, and a second copy of that arithmetic
// here would be one more place for the two to disagree.
export class Shard {
  constructor(scene, glowTex, x, y, z, dirX, dirZ, speed, damage, radius) {
    this.pos = new THREE.Vector3(x, y, z);
    this.vel = new THREE.Vector3(dirX, 0, dirZ).normalize().multiplyScalar(speed);
    this.damage = damage;
    this.radius = radius;
    this.life = 0.7;
    this.exploded = false;

    const mats = grenadeMaterials(glowTex);
    this.mesh = new THREE.Mesh(geo('shard', () => new THREE.OctahedronGeometry(0.12, 0)), mats.core);
    const sp = new THREE.Sprite(mats.glow);
    sp.scale.setScalar(0.8);
    this.mesh.add(sp);
    this.mesh.position.copy(this.pos);
    scene.add(this.mesh);
  }

  update(dt, ctx) {
    this.life -= dt;
    if (this.life <= 0) {
      this.explode(ctx);
      return 'expired';
    }
    this.pos.addScaledVector(this.vel, dt);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.x += dt * 12;
    this.mesh.rotation.y += dt * 9;

    // Horizontal test only. A shard flies at chest height and an enemy's `pos`
    // is at its FEET, so a 3D distance here was never smaller than the metre
    // between them and the shards sailed straight through everything - they
    // only ever went off on their fuse. Every enemy is taller than it is wide
    // and stands on the floor, so the XZ distance is the right comparison.
    for (const e of ctx.enemies) {
      if (e.dead) continue;
      const dx = this.pos.x - e.pos.x;
      const dz = this.pos.z - e.pos.z;
      const reach = e.radius + 0.4;
      if (dx * dx + dz * dz < reach * reach) {
        this.explode(ctx);
        return 'exploded';
      }
    }
    if (pointInObstacle(this.pos, ctx.obstacles)) {
      this.explode(ctx);
      return 'exploded';
    }
    return 'alive';
  }

  explode(ctx) {
    if (this.exploded) return;
    this.exploded = true;
    // The blast is measured from the floor under the shard, not from the shard
    // itself: enemy positions are at floor level, and blasting from chest
    // height would spend a metre of the radius on the vertical gap.
    _tmpTarget.set(this.pos.x, 0, this.pos.z);
    ctx.onBlast(_tmpTarget, this.damage, this.radius);
    this.mesh.visible = false;
  }
}

// Bomber's arcing shot: gravity-driven, explodes on contact or when its fuse
// runs out, and damages the player with falloff over its blast radius.
// Same return contract as Projectile, plus 'exploded'.
export class Grenade {
  constructor(scene, glowTex, x, y, z, target, speed, damage) {
    this.pos = new THREE.Vector3(x, y, z);
    this.vel = new THREE.Vector3(target.x - x, 0, target.z - z).normalize().multiplyScalar(speed * 0.6);
    this.vel.y = 8.5;
    this.speed = speed;
    this.damage = damage;
    this.life = 3.5;
    this.exploded = false;

    const mats = grenadeMaterials(glowTex);
    this.mesh = new THREE.Mesh(geo('grenade', () => new THREE.SphereGeometry(0.15, 8, 8)), mats.core);
    const sp = new THREE.Sprite(mats.glow);
    sp.scale.setScalar(1.0);
    this.mesh.add(sp);
    this.mesh.position.copy(this.pos);
    scene.add(this.mesh);
  }

  update(dt, ctx) {
    this.life -= dt;
    if (this.life <= 0 || this.exploded) {
      if (!this.exploded) this.explode(ctx);
      return 'expired';
    }
    this.vel.y -= 22 * dt;
    this.pos.addScaledVector(this.vel, dt);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.x += dt * 8;
    this.mesh.rotation.z += dt * 5;

    if (this.pos.y <= 0.2) {
      this.pos.y = 0.2;
      this.explode(ctx);
      return 'exploded';
    }
    if (pointInObstacle(this.pos, ctx.obstacles)) {
      this.explode(ctx);
      return 'exploded';
    }
    return 'alive';
  }

  explode(ctx) {
    if (this.exploded) return;
    this.exploded = true;
    const radius = 4.0;
    const d = this.pos.distanceTo(ctx.player.eyeInto(_tmpTarget));
    if (d < radius + 0.5) {
      ctx.onHitPlayer(this.damage * (1 - Math.min(1, d / radius)), this.pos);
    }
    if (ctx.effects) {
      ctx.effects.burst(this.pos, 0xff4400, 28, 8, 3, 0.6);
      ctx.effects.burst(this.pos, 0xffaa00, 16, 5, 2, 0.4);
    }
    if (ctx.sfx) ctx.sfx.kill();
    this.mesh.visible = false;
  }
}
