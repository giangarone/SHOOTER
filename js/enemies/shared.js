// WHAT EVERY THEME AND THE Enemy CLASS SHARE.
//
// The rule that decides what lives here is mechanical rather than editorial: a
// symbol is in this file if it is used by MORE THAN ONE theme, or by the Enemy
// class as well as a theme. Everything else lives in the one theme file that
// uses it. That is what keeps the ten theme files from importing each other -
// there is no edge between any two of them, so there is no cycle to reason
// about and a theme can be read on its own.
//
// It holds the geometry and material caches, the faceted primitives every
// model is built from, the status tables, the shared behaviours (aiMelee,
// orbit, landHit) and the two pieces of segment arithmetic TEMPEST and BRINE
// both ask for - plus ENEMY_TYPES itself, which the theme files register into
// and index.js re-exports.

import * as THREE from 'three';

// Scratch vectors for that armour test. It runs once per pellet on a shotgun
// and allocating there would litter the heap through a whole magazine.
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
//
//   fly         { height } makes the type AIRBORNE. See the flight block in
//               Enemy.update(): a flier keeps a real pos.y, so it clears low
//               cover for free (resolveCircle already skips a box it is above),
//               it is out of reach of a ground melee swing, and its model and
//               hitbox ride up with it. `height` is the altitude it settles at;
//               an ai() moves e.hoverY to climb or dive.

// THE REGISTRY ITSELF, and it is an EMPTY OBJECT here on purpose. Each theme
// file registers its own six (or nine, where a boss and its helpers live with
// it) into this at the bottom of itself, so the table is assembled by the act
// of importing the themes rather than by a list somebody has to keep in step
// with them - see js/enemies/index.js.
//
// It is declared here rather than in index.js because the theme files write
// into it: index.js imports THEM, so a table living there would be a cycle.
export const ENEMY_TYPES = {};

export const _armorA = new THREE.Vector3();

export const _armorB = new THREE.Vector3();

// Frees any telegraph handles a boss was holding when it died. Bosses keep
// theirs in bs.mark or bs.marks; both are covered here so a boss only has to
// name this as its `cleanup`.
export function releaseMarks(e) {
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
export const geoCache = new Map();

export function geo(key, make) {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}

// PLAGUE's splitter, as two constants rather than as a read off its own entry.
//
// The materials below are built when this module is evaluated, and this module
// is evaluated BEFORE any theme has registered - the theme files import it, so
// it goes first by construction. Reading ENEMY_TYPES.splitter.color here was
// therefore reading an empty table, which is a crash at load and not a subtle
// one. The colour lives here and plague.js's entry reads it back, so there is
// still exactly one number.
export const SPLITTER_BODY = 0xd6329a;
export const SPLITTER_EYE = 0xffb0e8;

export const SHARED_MATS = {
  gunmetal: new THREE.MeshStandardMaterial({ color: 0x2a2f3d, roughness: 0.4, metalness: 0.6 }),
  tankPlate: new THREE.MeshStandardMaterial({ color: 0x3a2515, roughness: 0.5, metalness: 0.6 }),
  // The furnace in a tank's chest. Emissive and NOT tinted by status, so the
  // one part of the model that says "this is the heavy" survives being frozen
  // or poisoned - see the note on the silhouette rules above.
  tankFurnace: new THREE.MeshStandardMaterial({
    color: 0xff6b00, emissive: 0xffaa00, emissiveIntensity: 1.3,
    roughness: 0.3, metalness: 0.5,
  }),
  sniperBarrel: new THREE.MeshStandardMaterial({ color: 0x1a1f2b, roughness: 0.3, metalness: 0.8 }),
  sniperScope: new THREE.MeshStandardMaterial({ color: 0x0a0f1a, roughness: 0.2, metalness: 0.9 }),
  splitterCore: new THREE.MeshStandardMaterial({
    color: SPLITTER_BODY, emissive: SPLITTER_BODY, emissiveIntensity: 1.2,
    roughness: 0.2, metalness: 0.8, transparent: true, opacity: 0.8,
  }),
  splitterRing: new THREE.MeshStandardMaterial({
    color: SPLITTER_EYE, emissive: SPLITTER_EYE, emissiveIntensity: 0.8,
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
  // ---- the afflictors ------------------------------------------------------
  // One lit part each, and in every case it is the part that DOES the thing:
  // the ember in a cinder's chest, the ice on a rime's back, the sacs a husk
  // is full of. These keep their own colour when the body is tinted by a
  // status - the same rule the tank's furnace follows - so an enemy that has
  // been frozen still says what it is.
  cinderEmber: new THREE.MeshStandardMaterial({
    color: 0xff7a18, emissive: 0xff5a00, emissiveIntensity: 1.7,
    roughness: 0.4, metalness: 0.1,
  }),
  rimeIce: new THREE.MeshStandardMaterial({
    color: 0xbfe6ff, emissive: 0x63b3ff, emissiveIntensity: 0.9,
    roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.75,
  }),
  huskSac: new THREE.MeshStandardMaterial({
    color: 0x8fbf4a, emissive: 0x4fe06a, emissiveIntensity: 1.0,
    roughness: 0.35, metalness: 0.1, transparent: true, opacity: 0.8,
  }),
  vitriolSac: new THREE.MeshStandardMaterial({
    color: 0x4fe06a, emissive: 0x4fe06a, emissiveIntensity: 1.2,
    roughness: 0.3, metalness: 0.2, transparent: true, opacity: 0.82,
  }),
  // The inside of a howler's mouth. Near-black and NOT emissive: it is the one
  // hole in the roster, and a hole that glows is a lamp.
  howlerMaw: new THREE.MeshStandardMaterial({
    color: 0x120a1c, roughness: 0.9, metalness: 0.0,
  }),
  hexerRing: new THREE.MeshStandardMaterial({
    color: 0xff2d6f, emissive: 0xff2d6f, emissiveIntensity: 1.5,
    roughness: 0.2, metalness: 0.7,
  }),
  shadeVeil: new THREE.MeshStandardMaterial({
    color: 0xb06bff, emissive: 0xb06bff, emissiveIntensity: 0.8,
    roughness: 0.5, metalness: 0.2, transparent: true, opacity: 0.5,
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
  // The two fliers share one design language and split it on colour: a lit
  // underside on both (nothing else in the roster glows downward, so "it is in
  // the air" reads before the shape does), cold blue for the one that holds
  // station and a bare blade for the one that arrives.
  harrierGlow: new THREE.MeshStandardMaterial({
    color: 0x27c4ff, emissive: 0x27c4ff, emissiveIntensity: 1.5,
    roughness: 0.3, metalness: 0.4, transparent: true, opacity: 0.85,
  }),
  shrikeEdge: new THREE.MeshStandardMaterial({
    color: 0x9aa8c4, roughness: 0.2, metalness: 0.9,
  }),
  hitbox: new THREE.MeshBasicMaterial({ visible: false }),
};

export const BODY_FLASH_HEX = 0xffffff;

export const BODY_FLASH_INTENSITY = 0.9;

export const BODY_BASE_INTENSITY = 0.18;

// ---- status effects ------------------------------------------------------
// Applied by the single-tier passive items in upgrades.js. A hit REFRESHES a
// status, it never stacks one: passive items have no second level, so there
// is no stronger poison to express. Duration is seconds remaining, counted
// down in update().
//
// STATUS_ORDER is tint priority. An enemy can carry several statuses at once,
// but it can only wear one colour, so the first active entry wins and the body
// holds that colour steadily - a body that alternated between green and orange
// every frame would read as a rendering fault, not as information.
export const STATUS_ORDER = ['freeze', 'burn', 'poison', 'slow', 'fear'];

export const STATUS_TINT = {
  freeze: 0xcfeaff,
  burn: 0xff7a18,
  poison: 0x39d353,
  slow: 0x63b3ff,
  fear: 0xb06bff,
};

// Well above BODY_BASE_INTENSITY (0.18) so an afflicted enemy is obvious in a
// crowd, and well below BODY_FLASH_INTENSITY (0.9) so it never reads as a hit.
export const STATUS_INTENSITY = 0.55;

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
export const STATUS_FX = {
  burn: { interval: 0.14, count: 3, speed: 1.7, up: 2.8, life: 0.45, y: 0.9 },
  poison: { interval: 0.22, count: 2, speed: 0.7, up: 1.7, life: 0.8, y: 0.8 },
  freeze: { interval: 0.24, count: 3, speed: 0.6, up: -0.8, life: 0.7, y: 1.25 },
  slow: { interval: 0.3, count: 2, speed: 0.5, up: -0.5, life: 0.65, y: 1.1 },
  fear: { interval: 0.2, count: 2, speed: 1.3, up: 2.4, life: 0.4, y: 1.45 },
};

export const SLOW_FACTOR = 0.5;

// TEMPEST's capacitor plate. Bright and cold rather than dulled like the
// warden's stone, and the difference is the mechanic: a warded enemy is not
// worth shooting at all and should stop looking like a target, while a plated
// one is worth shooting exactly once more than it looks.
export const PLATE_HEX = 0x7ef0ff;
// Magma's trail: how often it drops a patch while it is moving, and how big,
// how long and how hard each one burns. Five seconds is the brief - long
// enough that a corridor it walked down stays closed behind it.
// ---- what the afflictors leave behind ------------------------------------
//
// All of these are read by the type table above and by the ai functions at the
// bottom, so the numbers a player has to learn are in one place rather than
// spread over two thousand lines.

// STRATA's four. The numbers here are all about the ROOM - how far a thing
// travels before the wall turns it, how long a perch holds, how far back the
// floor remembers.
//
// The arena's own half-width, and the surface everything in this theme bounces
// off. Enemy.update already clamps bodies to it; the scree and the slinger's
// stone need the same number to reflect against, which is why it is named
// here rather than left as the literal it was in three places.
export const ARENA_HALF = 21.6;

// THE GAS. One rate for both things that make a cloud, because they are the
// same gas: what a vitriol throws and what a husk is full of. The hazard table
// in main.js carves the poison status's own damage out of this, so the number
// here is what standing in a cloud costs per second IN TOTAL.
export const GAS_DPS = 6;

// What a lit enemy leaves on you. Well under the cinder's four seconds: a
// cinder PAYS for its burn by hitting for five, and these are hitting for
// whatever their own stat block says on top of it.
export const BELLOWS_BURN = 2.5;

// How far above an enemy the player can be and still be hit by a melee swing.
// `dist` is measured on the XZ plane only - the whole game collides in 2D - so
// without this a rusher on the floor would land hits on a player standing on a
// catwalk four metres over its head. Generous enough to still cover the raised
// platforms, which are well inside a swing's reach.
//
// A MODULE CONSTANT AS WELL AS AN Enemy STATIC. The static is what main.js and
// the tests read and it stays; this is what an ai() reads, because a type's
// behaviour must not have to reach for the class - the shrike's dive is the
// one that does, and that single reference is the only thing that would tie a
// theme's file back to the class's.
export const MELEE_REACH_Y = 2.4;

// Scratch for the drip's spawn point. Module-level and reused: the drip runs
// for every afflicted enemy several times a second.
export const _dripAt = new THREE.Vector3();

export const _ashAt = new THREE.Vector3();

export const _hexFrom = new THREE.Vector3();

export const _hexTo = new THREE.Vector3();

// Scratch for the navigation heading. Module-level and consumed immediately:
// every enemy asks for one every frame.
export const _steer = { x: 0, z: 0 };

export const _latchFwd = new THREE.Vector3();

// Time constant of the walking-heading blend, in seconds. Short enough that a
// corner is still taken at full speed; long enough that a single disagreeing
// frame cannot turn a body around.
export const NAV_TURN = 0.1;

// Petrify's reward: a frozen enemy cannot act, and takes half again as much.
export const FREEZE_VULN = 1.5;

// ---- flight ---------------------------------------------------------------
// How fast a flier closes the gap between its current altitude and the one its
// ai() is asking for, as an exponential-approach rate. Per-enemy, because the
// difference between a shrike FALLING out of the sky and a harrier settling
// back to station is the whole distinction between the two types.
// How fast a ground enemy comes down off a step it has walked off. Not
// gravity: these have no vertical velocity, and a rusher stepping off a tread
// should read as taking the step down rather than as being dropped.
export const GROUND_FALL = 9;

// How long the model takes to catch up with a step the body has already taken.
// Short enough to still read as a step rather than as floating, long enough
// that four treads read as a climb instead of four cuts. Matched to the
// player's own camera smoothing so both sides of the fight move alike.
export const STEP_EASE = 0.11;

export const FLY_RATE_DEFAULT = 4;

// Ceiling on altitude, so nothing can climb out of the arena's lighting or
// past the point where a shot from the floor stops being a fair ask.
export const FLY_MAX_Y = 6.5;

// Every enemy's id, and the counter is PRIVATE to this module with a function
// over it rather than an exported `let`. An imported binding is read-only, so
// `++idSeq` from the class's file is a TypeError at runtime and not at parse
// time - it survived the syntax check and failed on the first enemy spawned.
let idSeq = 0;

export function nextEnemyId() {
  return ++idSeq;
}

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
export function partsFor(e, g, s) {
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
export const prism = (rt, rb, h, seg) => () => new THREE.CylinderGeometry(rt, rb, h, seg);

export const spike = (r, h, seg) => () => new THREE.ConeGeometry(r, h, seg);

export const slab = (w, h, d) => () => new THREE.BoxGeometry(w, h, d);

export const shard = (r) => () => new THREE.OctahedronGeometry(r, 0);

export const lump = (r) => () => new THREE.IcosahedronGeometry(r, 0);

export const rock = (r) => () => new THREE.DodecahedronGeometry(r, 0);

// The default pair of eyes, on the -z face. `y` and `spread` move them; most
// types take the default. Types whose identity is a machine or a monolith
// (conduit, warden, maw) call something else or nothing at all.
export function eyes(P, { y = 1.05, x = 0.13, z = -0.27, r = 1, mat }) {
  const o = { mat: mat || undefined, s: r, shadow: false };
  P('eyeShard', shard(0.07), { ...o, x: -x, y, z });
  P('eyeShard', shard(0.07), { ...o, x, y, z });
}

// ---- the original six ----------------------------------------------------

// SHRIKE. Four states in a fixed loop, and the loop IS the fight with it:
// circle out of reach, rear up (the tell), fall on a spot on the floor, then
// crawl back into the sky. Two of the four are the player's turn.
export const SHRIKE_HIGH = 5.2;

export const SHRIKE_DIVE_Y = 0.9;

// The tell. Long enough to see, react to and walk out of - it is the whole
// reason the dive is allowed to hurt as much as it does.
export const SHRIKE_WINDUP = 0.85;

export const SHRIKE_DIVE_TIME = 1.4;

export const SHRIKE_CLIMB_TIME = 1.5;

// Multiples of this enemy's own speed. The dive is the one movement in the
// game that beats the player's sprint, which is why it has to commit to a spot
// rather than track - see stepMul on Enemy for how it gets past the clamp
// every other enemy's velocity is held to.
export const SHRIKE_DIVE_MUL = 2.9;

export const SHRIKE_HIT_RANGE = 1.9;

export function aiShrike(e, a) {
  const ctx = a.ctx;
  if (e.sState === undefined) {
    e.sState = 'circle';
    e.sT = 1 + Math.random() * 1.6;
    e.stx = 0;
    e.stz = 0;
  }

  if (e.sState === 'circle') {
    orbit(e, a, ENEMY_TYPES[e.type].orbit);
    e.hoverY = SHRIKE_HIGH;
    e.flyRate = FLY_RATE_DEFAULT;
    e.stepMul = 1.4;
    e.sT -= a.dt;
    if (e.sT <= 0 && a.dist < 18) {
      e.sState = 'mark';
      e.sT = SHRIKE_WINDUP;
      e._setEyeAlert(true);
    }
    return;
  }

  if (e.sState === 'mark') {
    // Rears up and drifts in over the player. Rising while everything else in
    // the arena is coming DOWN the screen is the tell that carries at range,
    // and the eyes are the one that carries up close.
    e.hoverY = SHRIKE_HIGH + 1.0;
    e.flyRate = 5;
    a.vx = a.nx * a.sp * 0.5;
    a.vz = a.nz * a.sp * 0.5;
    e.sT -= a.dt;
    if (e.sT <= 0) {
      // Locked to the GROUND, not to the player. Everything telegraphed in
      // this game commits to a place; a dive that tracked would be an
      // unavoidable hit with a wind-up animation in front of it.
      e.stx = ctx.player.pos.x;
      e.stz = ctx.player.pos.z;
      e.sState = 'dive';
      e.sT = SHRIKE_DIVE_TIME;
      _blinkAt.set(e.stx, 0.06, e.stz);
      ctx.effects.shockwave(_blinkAt, ENEMY_TYPES[e.type].eye, 2.4, 0.5);
    }
    return;
  }

  if (e.sState === 'dive') {
    e.hoverY = SHRIKE_DIVE_Y;
    e.flyRate = 11;
    e.stepMul = SHRIKE_DIVE_MUL;
    const dx = e.stx - e.pos.x;
    const dz = e.stz - e.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    a.vx = (dx / d) * a.sp * SHRIKE_DIVE_MUL;
    a.vz = (dz / d) * a.sp * SHRIKE_DIVE_MUL;
    e.sT -= a.dt;
    // Hits whoever is in the way, not only whoever was standing on the mark:
    // it is a body travelling at thirteen metres a second and the mark is
    // where it is AIMED, not the extent of it.
    const dy = Math.abs(ctx.player.pos.y - e.pos.y);
    if (a.dist < SHRIKE_HIT_RANGE && dy < MELEE_REACH_Y) {
      // Through landHit, so a shade's dive leaves its fear where a shrike's
      // leaves nothing. The two fly the same loop and differ only in the type
      // block - see `shade`.
      landHit(e, ctx);
      _blinkAt.set(e.pos.x, e.pos.y, e.pos.z);
      ctx.effects.burst(_blinkAt, ENEMY_TYPES[e.type].eye, 14, 5, 2, 0.4);
      ctx.effects.addShake(0.12);
      _shrikeClimb(e);
      return;
    }
    // Out of time, or it has arrived at the spot and there was nobody on it.
    if (e.sT <= 0 || (d < 0.9 && e.pos.y < SHRIKE_DIVE_Y + 0.5)) {
      _blinkAt.set(e.pos.x, 0.1, e.pos.z);
      ctx.effects.burst(_blinkAt, 0xbfd0ff, 8, 3, 1.4, 0.4);
      _shrikeClimb(e);
    }
    return;
  }

  // CLIMB. The bill for a dive, hit or missed: a second and a half at half
  // speed, going up in a straight line away from the player. This is the shot
  // the player is meant to take, and it is why the shrike is allowed to be
  // untouchable for the rest of its loop.
  e.hoverY = SHRIKE_HIGH;
  e.flyRate = 2;
  e.stepMul = 1.4;
  a.vx = -a.nx * a.sp * 0.5;
  a.vz = -a.nz * a.sp * 0.5;
  e.sT -= a.dt;
  if (e.sT <= 0) {
    e.sState = 'circle';
    e.sT = 0.7 + Math.random() * 0.9;
  }
}

export function _shrikeClimb(e) {
  e.sState = 'climb';
  e.sT = SHRIKE_CLIMB_TIME;
  e.stepMul = 1.4;
  e._setEyeAlert(false);
}

// ---- TEMPEST ---------------------------------------------------------------
// The theme's language: PRONGS WITH A GAP, and something bright held in it.
// Every one of these is a pair of forks, rails, plates or vanes stood apart on
// thin rods, with the mass pushed out to the ends and nothing at all in the
// middle except the core.
//
// It is a different kind of hole from VOID's. VOID's gap is an absence - the
// part of the body that is missing - and TEMPEST's is the WORKING PART: the
// two ends are aimed at each other, and the eye reads the space between them
// as loaded rather than as empty. Every mechanic in the theme is a line
// between two points, and the bodies say so before anything fires.

// EVERY CONTACT HIT GOES THROUGH HERE. It deals the damage and then applies
// whatever the type leaves on the player - `hitStatus` on the type block, or
// nothing at all, which is what fourteen of the twenty-one types say.
//
// It exists so that "this enemy's touch burns you" is one line on the type
// rather than a branch inside _meleeCycle, and so a new afflictor cannot be
// written that forgets to apply its own status on one of the two paths a
// melee blow can take (contact and swing).
export function landHit(e, ctx, dmg = e.damage) {
  ctx.onHitPlayer(dmg, e.pos, e);
  const st = ENEMY_TYPES[e.type].hitStatus;
  if (st && ctx.applyPlayerStatus) ctx.applyPlayerStatus(st.kind, st.dur);
  // LIT BY A BELLOWS. Not a property of the type - a property of the moment,
  // refreshed by whatever bellows is currently reaching this enemy and gone a
  // quarter of a second after it stops. A cinder that is ALSO lit does not
  // stack: applyStatus refreshes rather than adding, so the player burns for
  // the longer of the two clocks at one rate.
  if (e.igniteT > 0 && ctx.applyPlayerStatus) {
    ctx.applyPlayerStatus('fire', BELLOWS_BURN);
  }
}

// The two melee types differ only in their windup numbers, which live on the
// type as `melee`.
export function aiMelee(e, a) {
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
export function orbit(e, a, o) {
  e.strafeT -= a.dt;
  if (e.strafeT <= 0) {
    e.strafe *= -1;
    e.strafeT = o.flip + Math.random() * o.flipVar;
  }
  const along = a.dist > o.dist + o.band ? o.out : a.dist < o.dist - o.band ? o.in : 0;
  a.vx = a.px * a.sp * along + -a.pz * e.strafe * a.sp * o.strafe;
  a.vz = a.pz * a.sp * along + a.px * e.strafe * a.sp * o.strafe;
}

export const _losRay = new THREE.Ray();

export const _losDir = new THREE.Vector3();

export const _losHit = new THREE.Vector3();

// Is there something solid on the line between these two points?
//
// Tested against the boxes rather than against the nav grid, because what this
// answers is "can it SEE the player" and the grid answers "can it walk there".
// A coil standing on a catwalk has a clear shot at somebody it could not reach
// on foot for ten seconds, and it should take it.
export function segBlocked(ax, ay, az, bx, by, bz, boxes) {
  if (!boxes || !boxes.length) return false;
  _losDir.set(bx - ax, by - ay, bz - az);
  const len = _losDir.length();
  if (len < 1e-4) return false;
  _losDir.multiplyScalar(1 / len);
  _losRay.origin.set(ax, ay, az);
  _losRay.direction.copy(_losDir);
  for (const box of boxes) {
    // intersectBox returns the ENTRY POINT or null, and the point matters:
    // a ray that would hit a pillar forty metres behind the player is not a
    // blocked shot, and intersectsBox on its own cannot tell the difference.
    if (_losRay.intersectBox(box, _losHit)) {
      const d = _losHit.distanceTo(_losRay.origin);
      if (d < len - 0.15) return true;
    }
  }
  return false;
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
export const BOSS_REACH_Y = 3.6;

// How far the player is above the arena floor. `a.dist` throughout the boss AI
// is XZ-only - the whole game collides in 2D - so this is the missing axis.
export function _reachY(a) {
  return Math.abs(a.ctx.player.pos.y);
}

export const BOSS_TOUCH_CAP = 30;

export const BOSS_TOUCH_CD = 1.2;

// How far past the body's own radius counts as touching. Matched to
// Enemy.CONTACT_PAD's intent on the ordinary roster: a shade wider, because a
// boss's collision radius is the barrel of its chest and its shoulders reach
// well past it.
export const BOSS_TOUCH_PAD = 0.9;

/**
 * Charges the player for standing on a boss. Uses bs.touchCd, so a boss with
 * its own touch clock (Maw) must not also call this.
 *
 * @param {number} mul  damage as a fraction of the boss's own hit
 * @returns {boolean} true if it connected this frame
 */
export function bossTouch(e, a, mul = 0.9) {
  const bs = e.bs;
  bs.touchCd = (bs.touchCd || 0) - a.dt;
  if (bs.touchCd > 0) return false;
  if (a.dist > e.radius + BOSS_TOUCH_PAD || _reachY(a) >= BOSS_REACH_Y) return false;
  bs.touchCd = BOSS_TOUCH_CD * e.rate;
  a.ctx.onHitPlayer(Math.min(BOSS_TOUCH_CAP, e.damage * mul), e.pos, e);
  _bossAt.set(e.pos.x, 1.2, e.pos.z);
  a.ctx.effects.burst(_bossAt, ENEMY_TYPES[e.type].eye, 12, 4, 1.6, 0.35);
  a.ctx.effects.addShake(0.12);
  return true;
}

// Scratch for boss effects, reused like every other vector in this file.
export const _bossAt = new THREE.Vector3();

// Scratch for the blink and for the drips the new types spawn. Module-level
// and consumed immediately, like _dripAt and _steer above.
export const _blinkFwd = new THREE.Vector3();

export const _blinkAt = new THREE.Vector3();

// The far end of the beam a wraith draws behind an arrival. Held separately
// from _blinkAt because both ends of the line are needed at once.
export const _blinkFrom = new THREE.Vector3();
