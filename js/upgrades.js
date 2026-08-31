// Roguelike upgrade pool and the wave-clear roll.
//
// Pure data plus a weighted picker: no three.js, no DOM, no game state. Like
// waves.js, this module is a leaf - main.js rolls one upgrade when a wave is
// cleared, hands the id to Player.takeUpgrade(), and it mutates player.mods
// from there. The player is never asked to choose; the roll is the reward.
//
// HOW AN UPGRADE WORKS
//   Every upgrade is a pure function of the stack count. `apply(mods, n)` is
//   called with n = 1, 2, 3... as the player takes it repeatedly, and is
//   ALWAYS re-applied from a fresh set of defaults (see Player.rebuildMods).
//   That means apply() must set absolute values, never accumulate:
//
//     GOOD  mods.fireRate *= 1 + 0.2 * n      (n is the full stack)
//     BAD   mods.fireRate *= 1.2              (only correct for n === 1)
//
//   Rebuilding from scratch is what keeps a run's stats reproducible and stops
//   rounding drift over twenty picks. It costs nothing - it runs once per
//   draft pick, not per frame.
//
// ADDING AN UPGRADE
//   Add an entry here with a unique key, a `rarity` from RARITY, a `max` stack
//   count, an apply(), and an `icon` NO OTHER ENTRY USES - add a new shape to
//   icons.js rather than borrowing one, because a shape worn by two mutations
//   teaches the player the wrong thing about both. `npm run test:icons` fails
//   the moment two entries share one. If it needs a stat that does not exist yet, add the
//   field to DEFAULT_MODS in player.js and read it wherever it applies. If it
//   needs to react to an event (a kill, a hit taken) rather than change a
//   stat, add the mod field here and the hook in main.js.
//
//   Because upgrades are granted at random, every entry must be worth getting
//   unprompted. An upgrade that is only useful alongside one specific other
//   upgrade does not belong in this pool.

export const RARITY = {
  common: { label: 'COMMON', color: '#9fb4d8', weight: 1 },
  rare: { label: 'RARE', color: '#4ef3ff', weight: 0.42 },
  cursed: { label: 'CURSED', color: '#ff3d00', weight: 0.3 },
  // Devil Deals. Weight 0 so a deal can never leak into a normal totem roll
  // even if the `devil` guard in rollTotems() is ever lost - the rarity gate
  // would drop it on its own. The label and colour are what the offer CARDS
  // used to print; they no longer do (see Totem._draw), so this entry exists
  // purely as a weight now.
  devil: { label: 'DEVIL DEAL', color: '#ff1744', weight: 0 },
};

// THEME COLOURS. An upgrade's colour is what it DOES, not how rare it is, so
// the totem can be read before any text is: gold means ammo, orange means rate
// of fire, cyan means armour, and the mutations each wear the colour of the
// thing they inflict - green poison, orange fire, pale blue ice.
//
// Entries are grouped into families and shaded apart inside one, so two
// upgrades never share a colour outright: the family is what makes the palette
// learnable, the shade is what makes a particular totem recognisable from the
// far side of the arena before its icon resolves. Add a shade to a family
// rather than opening a new hue when the two would land next to each other.
export const THEME = {
  // rate of fire
  rate: 0xff9500,
  frenzy: 0xd50000,
  // ammo and economy
  ammo: 0xffd600,
  brass: 0xffb300,
  fabricate: 0xffe57f,
  salvage: 0xc6ff00,
  gold: 0xf9a825,
  hoard: 0xffea00,
  // damage
  damage: 0xff3d00,
  precision: 0xff5fd2,
  glass: 0xcfe8ff,
  blast: 0xff6f00,
  ember: 0xbf360c,
  electric: 0xffee58,
  storm: 0x9fd8ff,
  flawless: 0xeaff6b,
  streak: 0xff2e88,
  // staying alive
  vitality: 0x00e676,
  armor: 0x4ef3ff,
  shock: 0x00b0ff,
  holy: 0xfff2b0,
  ninelives: 0xea80fc,
  blood: 0xff2d6f,
  // movement, and the one upgrade that pays for the absence of it
  mobility: 0x2979ff,
  poise: 0x7c4dff,
  leap: 0x82b1ff,
  impact: 0x00e5c0,
  surge: 0x1de9b6,
  // the shot itself: how it travels and what it costs to fire
  pierce: 0x76ff03,
  gravity: 0x536dfe,
  rage: 0x8b0000,
  burden: 0xff8a80,
  hex: 0x6a1b9a,
  feed: 0xffab40,
  evade: 0x18ffff,
  shrapnel: 0xff7043,
  charge: 0xe0e0e0,
  // status effects, matched to STATUS_TINT in enemy.js
  poison: 0x39d353,
  fire: 0xff5a00,
  ice: 0x7fe3ff,
  fear: 0x9d4edd,
  stone: 0x9aa5b1,
};

// DEVIL DEAL COLOURS.
//
// These follow THEME's rule and not a devil-red one: colour says what the
// upgrade DOES. Antidote is green because it is about poison and Absolute Zero
// is pale blue because it is about ice, and a run of thirteen identical
// crimsons would have thrown away the one thing that makes a pillar readable
// from across the arena. Most of them ARE blood and ember, because most of
// these deals are about damage and dying - that is the subject matter doing
// the work, not a palette rule.
//
// What says "this one costs you" is the PANEL: a red DEVIL DEAL header and a
// red price line, on every one of them, which is a far stronger and more
// specific signal than a hue could be. Kept in their own map only so the
// deals can be shaded apart from the free pool without colliding with it.
export const DEVIL_THEME = {
  carnage: 0xff1744,
  pact: 0xb71c1c,
  dodge: 0xff4081,
  hellfire: 0xff3d00,
  affliction: 0x7b1fa2,
  zero: 0x4fc3f7,
  overload: 0xffca28,
  executioner: 0x880e4f,
  antidote: 0x66bb6a,
  gamble: 0xff7043,
  presence: 0x6d1b3d,
  thorns: 0xd84315,
  power: 0xe53935,
};


// `effects` is the totem's whole readout: two or three lines, each a short
// phrase and a sign. The sign is about GOOD vs BAD, not about the arithmetic -
// "-30% RELOAD TIME" is a benefit and so scores +1 and renders green.
//
//    1  benefit   (green)
//   -1  drawback  (red)
//    0  neutral qualifier, drawn dim
//
// Keep each line under about 24 characters. It is read at a glance, mid-run,
// from across the arena - a sentence is already too long.
//
// A stacking upgrade writes `effects` as a function of the stack count the
// player already owns instead of a fixed array, so the line can name the tier
// they are on and the one the pick moves them to. See step() below.
const GOOD = 1;
const BAD = -1;
const NOTE = 0;

// TIERED READOUTS. A stacking upgrade's totem shows what THIS pick changes,
// not the whole ladder: the value the player is on now, an arrow, and the
// value they will be on if they take it. The first pick has no "now", so it
// shows the result on its own.
//
// The ladder printed out in full (`50% / 75% / 100%`) made the player work out
// which rung they were on before they could tell what a pick was worth, and it
// went stale the moment an apply() changed. `fmt` is called with a stack count
// and returns that tier's value, so the arithmetic sits next to the apply() it
// mirrors and reads the same numbers.
function step(owned, fmt) {
  return owned > 0 ? fmt(owned) + ' \u2192 ' + fmt(owned + 1) : fmt(owned + 1);
}
// The two shapes every multiplier in the pool takes: `1 + p * n` per stack,
// and `r ^ n` for one that shrinks.
const pctUp = (p) => (k) => '+' + Math.round(p * k) + '%';
const pctDown = (r) => (k) => '-' + Math.round((1 - Math.pow(r, k)) * 100) + '%';
const secs = (v) => (Math.round(v * 10) / 10) + 's';

/**
 * The effect lines to draw for a player who owns `owned` stacks of `def`.
 * A static array is used as-is - that is every max-1 mutation, which has no
 * tiers to compare. A function is a tiered readout; see step().
 */
export function effectLines(def, owned = 0) {
  return typeof def.effects === 'function' ? def.effects(owned) : def.effects;
}

export const UPGRADES = {
  overclock: {
    name: 'OVERCLOCK',
    rarity: 'common',
    max: 5,
    theme: THEME.rate,
    icon: 'throttle',
    effects: (n) => [['FIRE RATE ' + step(n, pctUp(20)), GOOD]],
    apply: (mods, n) => { mods.fireRate *= 1 + 0.2 * n; },
  },
  extendedMag: {
    name: 'EXTENDED MAG',
    rarity: 'common',
    max: 3,
    theme: THEME.ammo,
    icon: 'magazine',
    effects: (n) => [['MAGAZINE ' + step(n, pctUp(50)), GOOD]],
    apply: (mods, n) => { mods.magMult *= 1 + 0.5 * n; },
  },
  speedLoader: {
    name: 'SPEED LOADER',
    rarity: 'common',
    max: 3,
    theme: THEME.brass,
    icon: 'shell',
    effects: (n) => [['RELOAD ' + step(n, pctDown(0.7)), GOOD]],
    apply: (mods, n) => { mods.reloadMult *= Math.pow(0.7, n); },
  },
  hollowPoint: {
    name: 'HOLLOW POINT',
    rarity: 'common',
    max: 3,
    theme: THEME.damage,
    icon: 'bullet',
    effects: (n) => [
      ['DAMAGE ' + step(n, pctUp(30)), GOOD],
      ['MAGAZINE ' + step(n, pctDown(0.75)), BAD],
    ],
    apply: (mods, n) => {
      mods.damage *= 1 + 0.3 * n;
      mods.magMult *= Math.pow(0.75, n);
    },
  },
  nanoweave: {
    name: 'NANOWEAVE',
    rarity: 'common',
    max: 2,
    theme: THEME.vitality,
    icon: 'cross',
    effects: (n) => [
      ['REGEN ' + step(n, (k) => 5 * (1 + k) + ' HP/s'), GOOD],
      ['STARTS AFTER ' + step(n, (k) => secs(Math.max(0.8, 4 - 1.25 * k))), GOOD],
    ],
    apply: (mods, n) => {
      mods.regenDelay = Math.max(0.8, 4 - 1.25 * n);
      mods.regenRate = 5 * (1 + n);
    },
  },
  bulwark: {
    name: 'BULWARK',
    rarity: 'common',
    max: 3,
    theme: THEME.armor,
    icon: 'shield',
    effects: (n) => [
      ['MAX HEALTH ' + step(n, (k) => '+' + 50 * k), GOOD],
      ['MOVE SPEED ' + step(n, pctDown(0.88)), BAD],
    ],
    apply: (mods, n) => {
      mods.maxHpBonus += 50 * n;
      mods.moveMult *= Math.pow(0.88, n);
    },
  },
  scavenger: {
    name: 'SCAVENGER',
    rarity: 'common',
    max: 3,
    theme: THEME.salvage,
    icon: 'magnet',
    effects: (n) => [
      ['AMMO / KILL ' + step(n, (k) => '+' + 2 * k), GOOD],
      ['KILLS REFILL RESERVE', NOTE],
    ],
    apply: (mods, n) => {
      mods.ammoOnKill += 2 * n;
    },
  },
  combatStims: {
    name: 'COMBAT STIMS',
    rarity: 'common',
    max: 3,
    theme: THEME.mobility,
    icon: 'syringe',
    effects: (n) => [['MOVE SPEED ' + step(n, pctUp(15)), GOOD]],
    apply: (mods, n) => { mods.moveMult *= 1 + 0.15 * n; },
  },
  vampiric: {
    name: 'VAMPIRIC ROUNDS',
    rarity: 'rare',
    max: 3,
    theme: THEME.blood,
    icon: 'drop',
    effects: (n) => [
      ['HEAL 1 HP ON KILL', GOOD],
      ['CHANCE ' + step(n, (k) => 25 * (k + 1) + '%'), NOTE],
    ],
    // Chance per kill, one stack at a time: 50%, then 75%, then every kill.
    apply: (mods, n) => { mods.killHealChance = 0.25 * (n + 1); },
  },
  reactivePlating: {
    name: 'REACTIVE PLATING',
    rarity: 'rare',
    max: 3,
    theme: THEME.shock,
    icon: 'shockRing',
    effects: (n) => [
      ['SHOCKWAVE WHEN HIT', GOOD],
      ['DAMAGE ' + step(n, (k) => String(45 * k)), NOTE],
      ['RADIUS ' + step(n, (k) => 5 + k + 'm'), NOTE],
    ],
    apply: (mods, n) => {
      mods.shockwave += 45 * n;
      mods.shockwaveRadius = 5 + n;
    },
  },
  bloodlust: {
    name: 'BLOODLUST',
    rarity: 'rare',
    max: 1,
    theme: THEME.frenzy,
    icon: 'tally',
    // A gun that starts worse and is bought back by the kill chain. Tied to
    // the COMBO rather than to a timer of its own: the run already has one
    // clock for "are you still killing", and a second one beside it would be
    // two bars saying almost the same thing.
    effects: [
      ['-25% FIRE RATE', BAD],
      ['+5% PER COMBO KILL', GOOD],
      ['10 KILLS, UP TO +50%', NOTE],
    ],
    apply: (mods, n) => {
      mods.fireRate *= Math.pow(0.75, n);
      mods.bloodlust = 0.05 * n;
      mods.bloodlustMax = 10;
    },
  },
  ammoFab: {
    name: 'AMMO FABRICATOR',
    rarity: 'rare',
    max: 3,
    theme: THEME.fabricate,
    icon: 'hopper',
    effects: (n) => [['AMMO / SEC ' + step(n, (k) => '+' + 2.5 * k), GOOD]],
    apply: (mods, n) => { mods.ammoRegen += 2.5 * n; },
  },
  steadyAim: {
    name: 'STEADY AIM',
    rarity: 'rare',
    max: 2,
    theme: THEME.poise,
    icon: 'tripod',
    effects: (n) => [
      ['DAMAGE ' + step(n, pctUp(40)), GOOD],
      ['WHILE STANDING STILL', NOTE],
    ],
    apply: (mods, n) => { mods.steady += 0.4 * n; },
  },
  // ---- MUTATIONS ---------------------------------------------------------
  // Single-tier picks: max 1, no levels, one distinct behaviour each. Where
  // every upgrade above answers "how much", these answer "what happens" - the
  // player should be able to name what a mutation does from watching one shot
  // land, without reading the totem twice.
  //
  // The ones that afflict an enemy all have to SAY SO ON THE ENEMY. A status
  // the player cannot see is a stat increase with extra steps, so each drives
  // a body tint and a particle drip (see STATUS_TINT in enemy.js) and the
  // colours are held distinct from each other and from the hit flash.
  //
  // `mark: true` also puts a plate in the theme colour on the gun's receiver
  // (see setGunMarks in weapons.js). It belongs on upgrades that change what a
  // bullet DOES to what it hits - a status, a chain, a blast, a second shot -
  // and never on a stat change. Twelve plates fit; keep the marked set inside
  // that. Passive numbers like magazine size or reload speed stay unmarked, or
  // the readout stops meaning anything.
  venom: {
    mark: true,
    name: 'VENOM ROUNDS',
    rarity: 'rare',
    max: 1,
    theme: THEME.poison,
    icon: 'flask',
    effects: [['HITS POISON', GOOD], ['12 DMG / SEC, 4s', NOTE]],
    apply: (mods, n) => {
      mods.poisonDps = 12 * n;
      mods.poisonTime = 4 * n;
    },
  },
  incendiary: {
    mark: true,
    name: 'INCENDIARY',
    rarity: 'rare',
    max: 1,
    theme: THEME.fire,
    icon: 'flame',
    effects: [['HITS SET FIRE', GOOD], ['20 DMG / SEC, 3s', NOTE], ['SPREADS ON DEATH', NOTE]],
    apply: (mods, n) => {
      mods.burnDps = 20 * n;
      mods.burnTime = 3 * n;
      mods.burnSpread = 3 * n;
    },
  },
  cryo: {
    mark: true,
    name: 'CRYO ROUNDS',
    rarity: 'rare',
    max: 1,
    theme: THEME.ice,
    icon: 'icicle',
    effects: [['HITS SLOW BY HALF', GOOD], ['THEIR SHOTS TOO, 3s', NOTE]],
    apply: (mods, n) => { mods.slowTime = 3 * n; },
  },
  terror: {
    mark: true,
    name: 'TERROR',
    rarity: 'rare',
    max: 1,
    theme: THEME.fear,
    icon: 'skull',
    effects: [['HIT ENEMIES FLEE', GOOD], ['2s, CANNOT ATTACK', NOTE]],
    apply: (mods, n) => { mods.fearTime = 2 * n; },
  },
  petrify: {
    mark: true,
    name: 'PETRIFY',
    rarity: 'rare',
    max: 1,
    theme: THEME.stone,
    icon: 'stone',
    effects: [['12% TO FREEZE 1.5s', GOOD], ['FROZEN TAKE +50%', GOOD]],
    apply: (mods, n) => {
      mods.petrifyChance = 0.12 * n;
      mods.petrifyTime = 1.5 * n;
    },
  },
  arcRounds: {
    mark: true,
    name: 'ARC ROUNDS',
    rarity: 'rare',
    max: 1,
    theme: THEME.electric,
    icon: 'arc',
    effects: [['CHAINS TO 1 ENEMY', GOOD], ['CHAIN HITS FOR 40%', NOTE]],
    apply: (mods, n) => {
      mods.chainDamage = 0.4 * n;
      mods.chainRange = 6;
    },
  },
  knockout: {
    mark: true,
    name: 'KNOCKOUT DROPS',
    rarity: 'rare',
    max: 1,
    theme: THEME.impact,
    icon: 'hammer',
    effects: [['HITS SHOVE ENEMIES', GOOD], ['1.5 METRES BACK', NOTE]],
    apply: (mods, n) => { mods.knockback = 1.5 * n; },
  },
  midas: {
    name: 'MIDAS TOUCH',
    rarity: 'rare',
    max: 1,
    theme: THEME.gold,
    icon: 'coin',
    effects: [['2x CREDITS', GOOD], ['THE HIT TURN GOLD', NOTE]],
    apply: (mods, n) => {
      mods.creditMult *= 1 + n;
      mods.midas = 1;
    },
  },
  detonator: {
    mark: true,
    name: 'DETONATOR',
    rarity: 'cursed',
    max: 1,
    theme: THEME.blast,
    icon: 'bomb',
    effects: [['HITS EXPLODE', GOOD], ['30 DMG IN 2.5m', NOTE], ['-25% FIRE RATE', BAD]],
    apply: (mods, n) => {
      mods.blastDamage = 30 * n;
      mods.blastRadius = 2.5;
      mods.fireRate *= Math.pow(0.75, n);
    },
  },
  blastCorpse: {
    mark: true,
    name: 'BLAST CORPSE',
    rarity: 'cursed',
    max: 1,
    theme: THEME.ember,
    icon: 'burst',
    effects: [['THE DEAD EXPLODE', GOOD], ['45 DMG IN 4m', NOTE], ['IT CAN HIT YOU', BAD]],
    apply: (mods, n) => {
      mods.corpseDamage = 45 * n;
      mods.corpseRadius = 4;
    },
  },
  twentyTwenty: {
    mark: true,
    name: 'TWENTY/TWENTY',
    rarity: 'rare',
    max: 1,
    theme: THEME.precision,
    icon: 'twinShot',
    effects: [['EVERY SHOT FIRES 2x', GOOD], ['60% DAMAGE EACH', BAD]],
    apply: (mods, n) => {
      mods.volley = 1 + n;
      mods.volleyDamage = 0.6;
    },
  },
  holyMantle: {
    name: 'HOLY MANTLE',
    rarity: 'rare',
    max: 1,
    theme: THEME.holy,
    icon: 'halo',
    effects: [['1st HIT EACH WAVE', GOOD], ['DEALS NO DAMAGE', NOTE]],
    apply: (mods, n) => { mods.wardPerWave = n; },
  },
  deadCat: {
    name: 'DEAD CAT',
    rarity: 'cursed',
    max: 1,
    theme: THEME.ninelives,
    icon: 'cat',
    effects: [['REVIVE ONCE AT 1 HP', GOOD], ['-40% MAX HEALTH', BAD]],
    apply: (mods, n) => {
      mods.extraLives += n;
      mods.maxHpMult *= Math.pow(0.6, n);
    },
  },
  glassCannon: {
    name: 'GLASS CANNON',
    rarity: 'cursed',
    max: 1,
    theme: THEME.glass,
    icon: 'crystal',
    effects: [['+70% DAMAGE', GOOD], ['-50% MAX HEALTH', BAD]],
    apply: (mods, n) => {
      mods.damage *= 1 + 0.7 * n;
      mods.maxHpMult *= Math.pow(0.5, n);
    },
  },
  piercingShot: {
    name: 'PIERCING SHOT',
    rarity: 'rare',
    max: 3,
    mark: true,
    theme: THEME.pierce,
    icon: 'pierce',
    effects: (n) => [
      ['PIERCE ' + step(n, (k) => String(k)), GOOD],
      ['ENEMIES PER SHOT', NOTE],
      ['-30% DMG EACH ONE', BAD],
    ],
    apply: (mods, n) => {
      mods.pierce = n;
      mods.pierceFalloff = 0.7;
    },
  },
  gravityRounds: {
    name: 'GRAVITY ROUNDS',
    rarity: 'rare',
    max: 1,
    mark: true,
    theme: THEME.gravity,
    icon: 'vortex',
    effects: [['HITS DRAG ENEMIES IN', GOOD], ['1.5m, WITHIN 5m', NOTE]],
    apply: (mods, n) => {
      mods.gravityPull = 1.5 * n;
      mods.gravityRadius = 5;
    },
  },
  berserker: {
    name: 'BERSERKER',
    rarity: 'rare',
    max: 2,
    theme: THEME.rage,
    icon: 'pulse',
    // Deliberately no numbers: the shape of the deal is the whole pick, and a
    // percentage that only pays at an HP the player is trying not to be at
    // told them less than the sentence does.
    effects: [
      ['THE LESS HP YOU HAVE', NOTE],
      ['THE MORE DAMAGE YOU DEAL', GOOD],
    ],
    apply: (mods, n) => { mods.berserk += 0.5 * n; },
  },
  tripleTap: {
    name: 'TRIPLE TAP',
    rarity: 'cursed',
    max: 1,
    theme: THEME.burden,
    icon: 'trio',
    effects: [['+70% DAMAGE', GOOD], ['3 AMMO PER SHOT', BAD]],
    apply: (mods, n) => {
      mods.damage *= 1 + 0.7 * n;
      mods.ammoPerShot = 1 + 2 * n;
    },
  },
  cursedAmmo: {
    name: 'CURSED AMMO',
    rarity: 'cursed',
    max: 1,
    theme: THEME.hex,
    icon: 'sigil',
    // The floor is the whole reason this is playable: without it a held
    // trigger kills you from full health with no enemy in the room.
    effects: [['20% OF SHOTS: 2x DMG', GOOD], ['THOSE COST 1 HP', BAD], ['NEVER BELOW 1 HP', NOTE]],
    apply: (mods, n) => {
      mods.cursedChance = 0.2 * n;
      mods.cursedDamage = 1;
    },
  },
  beltFeed: {
    name: 'BELT FEED',
    rarity: 'common',
    max: 3,
    theme: THEME.feed,
    icon: 'belt',
    effects: (n) => [
      [step(n, pctUp(10)) + ' OF SHOTS', GOOD],
      ['FIRE FROM THE RESERVE', NOTE],
      ['SO YOU RELOAD LESS', GOOD],
    ],
    apply: (mods, n) => { mods.beltFeed = 0.1 * n; },
  },
  evasion: {
    name: 'EVASION',
    rarity: 'rare',
    max: 3,
    theme: THEME.evade,
    icon: 'wing',
    effects: (n) => [
      ['DODGE ' + step(n, pctUp(12)), GOOD],
      ['OF HITS TAKEN', NOTE],
      ['+40% SPEED ON DODGE', GOOD],
    ],
    apply: (mods, n) => { mods.dodgeChance = 0.12 * n; },
  },
  reloadBurst: {
    name: 'RELOAD BURST',
    rarity: 'rare',
    max: 1,
    mark: true,
    theme: THEME.shrapnel,
    icon: 'flechette',
    effects: [['RELOAD THROWS 8', GOOD], ['SHARDS, 25 DMG EACH', NOTE], ['THEY CANNOT HURT YOU', NOTE]],
    apply: (mods, n) => {
      mods.reloadShards = 8 * n;
      mods.reloadShardDamage = 25 * n;
    },
  },
  crystallize: {
    name: 'CRYSTALLIZE',
    rarity: 'rare',
    max: 1,
    mark: true,
    theme: THEME.ice,
    icon: 'shatter',
    effects: [['FROZEN DEAD SHATTER', GOOD], ['60 DMG IN 3.5m', NOTE]],
    apply: (mods, n) => {
      mods.shatterDamage = 60 * n;
      mods.shatterRadius = 3.5;
    },
  },
  ashen: {
    name: 'ASHEN',
    rarity: 'rare',
    max: 1,
    mark: true,
    theme: THEME.ember,
    icon: 'cloud',
    // A lingering ZONE, not another instant blast: Blast Corpse and
    // Crystallize already own that shape, and a cloud you have to push enemies
    // through plays differently from a puff you never see.
    // A CHANCE rather than a certainty. Once Incendiary is running, every
    // burning enemy in a wave dies burning, and a cloud per corpse buried the
    // arena in ash: the zones stopped being places the player had to steer
    // enemies into and became the floor. At 15% a cloud is an event again.
    effects: [['15% OF BURNING DEAD', NOTE], ['LEAVE ASH: 18 DMG/s, 4s', GOOD], ['IN A 3.5m CLOUD', NOTE]],
    apply: (mods, n) => {
      mods.ashDps = 18 * n;
      mods.ashRadius = 3.5;
      mods.ashTime = 4;
      mods.ashChance = 0.15;
    },
  },
  neurotoxin: {
    name: 'NEUROTOXIN',
    rarity: 'rare',
    max: 1,
    mark: true,
    theme: THEME.poison,
    icon: 'spore',
    // Slowing a poisoned enemy would have been Cryo Rounds with a different
    // name - Cryo already halves their speed and their shots. Spreading is the
    // thing only poison does.
    effects: [['POISON JUMPS ENEMY', GOOD], ['TO ENEMY, WITHIN 3m', NOTE]],
    apply: (mods, n) => { mods.poisonSpread = 3 * n; },
  },
  entropy: {
    name: 'ENTROPY',
    rarity: 'common',
    max: 1,
    mark: true,
    theme: THEME.stone,
    icon: 'hourglass',
    effects: [['STATUS NEVER ENDS', GOOD], ['ON ENEMIES UNDER 30%', NOTE]],
    apply: (mods, n) => { mods.entropyBelow = 0.3 * n; },
  },
  malady: {
    name: 'MALADY',
    rarity: 'rare',
    max: 1,
    mark: true,
    theme: THEME.fire,
    icon: 'trefoil',
    // Poison and burn ONLY. Cryo, Terror and Petrify have no strength to
    // amplify, so the same trade on them would be a drawback with no upside.
    // The old line read "+50% POISON & BURN", which never said WHICH axis moved
    // - a player could not tell a stronger effect from a longer one. Name the
    // axis on its own line and the trade reads in one pass.
    effects: [
      ['POISON & BURN DEAL', NOTE],
      ['+50% DAMAGE PER SEC', GOOD],
      ['FOR HALF AS LONG', BAD],
    ],
    apply: (mods, n) => {
      mods.dotPower *= 1 + 0.5 * n;
      mods.dotTime *= Math.pow(0.5, n);
    },
  },
  breachRound: {
    name: 'BREACH ROUND',
    rarity: 'rare',
    max: 1,
    mark: true,
    theme: THEME.charge,
    icon: 'plunger',
    // Armed by the reload rather than by a timer, so it rewards a rhythm the
    // player already has instead of asking them to stand still and not shoot.
    effects: [['1st SHOT AFTER EVERY', GOOD], ['RELOAD EXPLODES', GOOD], ['70 DMG IN 4m', NOTE]],
    apply: (mods, n) => {
      mods.chargeDamage = 70 * n;
      mods.chargeRadius = 4;
    },
  },
  seeker: {
    name: 'SEEKER',
    rarity: 'rare',
    max: 1,
    mark: true,
    theme: THEME.precision,
    icon: 'crosshair',
    // Rescues MISSES and nothing else. A shot already on target is never
    // touched, so this can never drag a bullet off the weak point the player
    // deliberately lined up - it only takes the shots that were going to hit
    // a wall and gives them somewhere to go.
    effects: [['MISSED SHOTS CURVE', GOOD], ['TO A TARGET IN 12 deg', NOTE], ['HITS ARE NEVER MOVED', NOTE]],
    apply: (mods, n) => {
      mods.homingAngle = 0.21 * n;
      mods.homingRange = 30;
    },
  },
  lightningWizard: {
    name: 'LIGHTNING WIZARD',
    rarity: 'rare',
    max: 1,
    mark: true,
    theme: THEME.storm,
    icon: 'bolt',
    // Rare per shot and heavy when it lands, which is the opposite trade to
    // Arc Rounds: that one is a small certainty on every hit, this is a large
    // uncertainty. At 5% a magazine usually contains one, so it reads as
    // punctuation rather than as a damage number the player has to plan on.
    effects: [['5% OF HITS CALL', GOOD], ['LIGHTNING: 90 DMG', NOTE], ['+50 AROUND IT', NOTE]],
    apply: (mods, n) => {
      mods.lightningChance = 0.05 * n;
      mods.lightningDamage = 90 * n;
      mods.lightningSplash = 50 * n;
      mods.lightningRadius = 4;
    },
  },
  noHitBonus: {
    name: 'NO-HIT BONUS',
    rarity: 'rare',
    max: 1,
    mark: true,
    theme: THEME.flawless,
    icon: 'chevron',
    // The only PERMANENT growth in the pool, and the only reward for a skill
    // the game already measured and only ever paid in credits. It stacks for
    // the rest of the run, so a player who keeps clearing waves clean is
    // building - and a single hit anywhere in a wave costs them that wave's
    // stack, which is what makes it worth playing around.
    //
    // Capped, and additively rather than compounding. Uncapped compounding was
    // the one line in the pool with no ceiling: a player who was already good
    // enough not to be touched kept multiplying, so by wave 30 it was worth
    // more than the rest of the build put together. Five clean waves for a
    // flat +40% is still the best rare in the pool and is now a target the
    // player can actually finish.
    effects: [['CLEAR A WAVE UNHURT:', NOTE], ['+8% DAMAGE & RATE', GOOD], ['STACKS TO +40%', NOTE]],
    apply: (mods, n) => { mods.noHitBonus = 0.08 * n; },
  },
  ammoHoarder: {
    name: 'AMMO HOARDER',
    rarity: 'rare',
    max: 1,
    theme: THEME.hoard,
    icon: 'drum',
    // Unmarked: the receiver plates say what a BULLET does, and this changes
    // nothing about the bullet. It is the only upgrade that touches reserve
    // CAPACITY rather than reserve income, which is what makes it worth a slot
    // next to Scavenger and Ammo Fabricator instead of competing with them.
    effects: [['2x MAX AMMO RESERVE', GOOD], ['300 \u2192 600 ROUNDS', NOTE]],
    apply: (mods, n) => { mods.reserveMult = 1 + n; },
  },
  hotStreak: {
    name: 'HOT STREAK',
    rarity: 'rare',
    max: 1,
    theme: THEME.streak,
    icon: 'stack',
    // The floor is REAL: miss enough and this deals less than no upgrade at
    // all. That is the whole pick - every other damage upgrade in the pool is
    // free once taken, and this one asks to be earned again every magazine.
    // It rides the same per-shot hit flag the hitmarker does, so the number
    // can never disagree with what the player just saw.
    effects: [['+1% DMG PER HIT', GOOD], ['-1% PER MISS', BAD], ['+30% CAP, -10% FLOOR', NOTE]],
    apply: (mods, n) => {
      mods.streakStep = 0.01 * n;
      mods.streakCap = 0.3;
      mods.streakFloor = 0.1;
    },
  },
  doubleJump: {
    name: 'DOUBLE JUMP',
    rarity: 'rare',
    max: 1,
    theme: THEME.leap,
    icon: 'spring',
    // The air jump is deliberately STRONGER than the ground one (11 vs 9
    // against gravity 22): a second hop that only matched the first would clear
    // nothing the first had not already cleared. At 11 off the apex the player
    // tops out near 4.6m, which is over every enemy in the pool and onto the
    // high platforms.
    effects: [['JUMP AGAIN IN MIDAIR', GOOD], ['CLEARS ~4.5m TOTAL', NOTE]],
    apply: (mods, n) => { mods.extraJumps = n; },
  },
  doubleDash: {
    name: 'DOUBLE DASH',
    rarity: 'rare',
    max: 1,
    theme: THEME.surge,
    icon: 'boost',
    // Bound to a double-tap rather than to a key of its own because the game
    // has no spare finger: the player is already holding a movement key, the
    // mouse and the trigger. Tapping the direction you are ALREADY running is
    // the one input that costs nothing to reach.
    effects: [['DOUBLE-TAP W A S D', NOTE], ['TO DASH. 2 CHARGES', GOOD], ['ONE BACK EVERY 2.5s', NOTE]],
    apply: (mods, n) => { mods.dashCharges = 2 * n; },
  },

  // ---- DEVIL DEALS -------------------------------------------------------
  //
  // Everything below is flagged `devil: true` and carries a `cost` in MAX HP.
  // They live in this same map on purpose: a deal IS a mutation - it lights a
  // receiver plate, shows in the build sheet and rebuilds through
  // Player.rebuildMods() exactly like the free half of the pool does. The flag
  // is only about where it can be OFFERED, and rollTotems() is the one place
  // that reads it.
  //
  // `cost` is permanent. It is the only resource in the game that never comes
  // back, which is the whole reason the Devil is worth walking to - and why
  // main.js refuses a deal outright rather than letting one kill you. See
  // Player.canPay() and MIN_MAX_HEALTH.

  carnage: {
    name: 'CARNAGE',
    rarity: 'devil',
    devil: true,
    cost: 20,
    max: 1,
    mark: true,
    theme: DEVIL_THEME.carnage,
    icon: 'claw',
    // Named CARNAGE and not Bloodlust because BLOODLUST is already in this map
    // above, paying fire rate for a combo. Two mutations with one name would be
    // unreadable on the build sheet.
    effects: [['KILLS: +5% DAMAGE', GOOD], ['STACKS, NO LIMIT', NOTE], ['RESET WHEN HURT', BAD]],
    apply: (mods, n) => { mods.carnageStep = 0.05 * n; },
  },
  bloodPact: {
    name: 'BLOOD PACT',
    rarity: 'devil',
    devil: true,
    cost: 20,
    max: 1,
    theme: DEVIL_THEME.pact,
    icon: 'chalice',
    effects: [['KILLS HEAL 3 HP', GOOD], ['TAKE +25% DAMAGE', BAD]],
    apply: (mods, n) => {
      mods.killHeal = 3 * n;
      mods.damageTakenMult *= 1 + 0.25 * n;
    },
  },
  demonicDodge: {
    name: 'DEMONIC DODGE',
    rarity: 'devil',
    devil: true,
    cost: 20,
    max: 1,
    theme: DEVIL_THEME.dodge,
    icon: 'batWing',
    // dodgeChance is the same field Evasion sets, so the two ADD - a player who
    // owns both dodges more often, and both mutations still read as doing the
    // thing they say. The reward on top is what makes this the devil's version.
    effects: [['10% DODGE CHANCE', GOOD], ['DODGE: 1s INVULNERABLE', GOOD], ['AND +100% DMG FOR 3s', GOOD]],
    apply: (mods, n) => {
      mods.dodgeChance += 0.1 * n;
      mods.dodgeInvuln = 1;
      mods.dodgeRage = 1.0;
      mods.dodgeRageTime = 3;
    },
  },
  hellfire: {
    name: 'HELLFIRE',
    rarity: 'devil',
    devil: true,
    cost: 10,
    max: 1,
    mark: true,
    theme: DEVIL_THEME.hellfire,
    icon: 'firetrail',
    // Armed by the reload, the same signal Reload Burst and Breach Round ride,
    // so it pays a rhythm the player already has instead of asking for a new one.
    effects: [['RELOAD LEAVES A', NOTE], ['FIRE TRAIL FOR 5s', GOOD], ['60 DMG/s TO ENEMIES', NOTE]],
    apply: (mods, n) => {
      mods.hellfireDps = 60 * n;
      mods.hellfireTime = 5;
      mods.hellfireRadius = 1.8;
    },
  },
  eternalAffliction: {
    name: 'ETERNAL AFFLICTION',
    rarity: 'devil',
    devil: true,
    cost: 20,
    max: 1,
    mark: true,
    theme: DEVIL_THEME.affliction,
    icon: 'infinity',
    // The drafted drawback was "status effects on you last twice as long", and
    // the player has no status effects - only hazard zones to stand out of. So
    // the cost lands on those instead, which is the same idea in the vocabulary
    // the game actually has.
    effects: [['ENEMY STATUS NEVER', NOTE], ['EXPIRES', GOOD], ['POOLS & LAVA HURT 2x', BAD]],
    apply: (mods, n) => {
      mods.statusEternal = n;
      mods.hazardMult *= 2;
    },
  },
  absoluteZero: {
    name: 'ABSOLUTE ZERO',
    rarity: 'devil',
    devil: true,
    cost: 10,
    max: 1,
    theme: DEVIL_THEME.zero,
    icon: 'snowflake',
    effects: [['ENEMIES & SHOTS', NOTE], ['MOVE 20% SLOWER', GOOD], ['HITS FREEZE YOU 1s', BAD]],
    apply: (mods, n) => {
      mods.worldSlow = Math.pow(0.8, n);
      mods.hitFreeze = 1;
    },
  },
  overload: {
    name: 'OVERLOAD',
    rarity: 'devil',
    devil: true,
    cost: 20,
    max: 1,
    mark: true,
    theme: DEVIL_THEME.overload,
    icon: 'discharge',
    // A fraction of MAX HP rather than a flat number, so it stays worth firing
    // the magazine dry on wave 40 as much as on wave 4. It is the one thing in
    // the pool that scales with the enemy instead of with the build.
    effects: [['EMPTY THE MAGAZINE:', NOTE], ['LIGHTNING HITS ALL', GOOD], ['FOR 20% OF MAX HP', NOTE]],
    apply: (mods, n) => { mods.overloadFrac = 0.2 * n; },
  },
  executioner: {
    name: 'EXECUTIONER',
    rarity: 'devil',
    devil: true,
    cost: 50,
    max: 1,
    theme: DEVIL_THEME.executioner,
    icon: 'axe',
    // The most expensive thing the Devil sells, and the only one that is worth
    // nothing for four waves out of five. Applies to bosses spawned AFTER it is
    // taken - a boss already standing keeps the health bar it arrived with.
    effects: [['BOSSES HAVE 50%', NOTE], ['LESS HEALTH', GOOD]],
    apply: (mods, n) => { mods.bossHpMult *= Math.pow(0.5, n); },
  },
  antidote: {
    name: 'ANTIDOTE',
    rarity: 'devil',
    devil: true,
    cost: 10,
    max: 1,
    theme: DEVIL_THEME.antidote,
    icon: 'capsule',
    effects: [['IMMUNE TO POISON', GOOD], ['HEAL 1 HP/s PER', GOOD], ['POISONED ENEMY', NOTE]],
    apply: (mods, n) => {
      mods.poisonImmune = n;
      mods.poisonLeech = 1 * n;
    },
  },
  devilsGamble: {
    name: "DEVIL'S GAMBLE",
    rarity: 'devil',
    devil: true,
    cost: 5,
    max: 1,
    mark: true,
    theme: DEVIL_THEME.gamble,
    icon: 'dice',
    // Rolled once per SHOT, not per pellet: a shotgun whose nine pellets each
    // rolled their own coin would average out to nothing, and the whole point
    // is that a shot is either a windfall or a waste.
    effects: [['51% OF SHOTS: 2x DMG', GOOD], ['49% OF SHOTS: HALF', BAD]],
    apply: (mods, n) => { mods.gamble = n; },
  },
  demonicPresence: {
    name: 'DEMONIC PRESENCE',
    rarity: 'devil',
    devil: true,
    cost: 20,
    max: 1,
    theme: DEVIL_THEME.presence,
    icon: 'horns',
    effects: [['THE DEVIL ALWAYS', NOTE], ['APPEARS AFTER A WAVE', GOOD]],
    apply: (mods, n) => { mods.devilAlways = n; },
  },
  thorns: {
    name: 'THORNS',
    rarity: 'devil',
    devil: true,
    cost: 5,
    max: 1,
    theme: DEVIL_THEME.thorns,
    icon: 'spikeShield',
    effects: [['ATTACKERS TAKE BACK', NOTE], ['50% OF THEIR DAMAGE', GOOD]],
    apply: (mods, n) => { mods.thorns = 0.5 * n; },
  },
  darkPower: {
    name: 'DARK POWER',
    rarity: 'devil',
    devil: true,
    cost: 5,
    max: 1,
    theme: DEVIL_THEME.power,
    icon: 'sword',
    // The cheapest deal in the pool and the only one with no drawback at all.
    // It is what the Devil is FOR: five max HP is a real price and +20% damage
    // is a real answer, with nothing else to weigh.
    effects: [['+20% DAMAGE', GOOD]],
    apply: (mods, n) => { mods.damage *= 1 + 0.2 * n; },
  },
};

export const UPGRADE_KEYS = Object.keys(UPGRADES);

// Rarity gate: keeps the first few picks as plain foundations, then opens up.
// Returns the roll weight for a rarity on a given wave, or 0 if it is not
// available yet.
function rarityWeight(rarity, wave) {
  if (rarity === 'rare' && wave < 2) return 0;
  if (rarity === 'cursed' && wave < 3) return 0;
  const base = RARITY[rarity].weight;
  // Rares get commoner as the run goes on; commons never fall out of the pool
  // because low-rarity stat stacking is what a build is made of. The ramp is
  // deliberately shallow and capped: the mutations are all rare or cursed, so
  // the rare half of the pool is now three times the size it was, and the old
  // +0.05 climb to 1.0 would have crowded stat stacking out of a long run
  // entirely rather than merely making it less certain.
  if (rarity === 'rare') return Math.min(0.7, base + wave * 0.02);
  return base;
}

/**
 * Rolls the three upgrades offered on a totem set.
 *
 * Drawn WITHOUT replacement, so one upgrade can never fill two totems of the
 * same set. Upgrades already at their stack cap drop out of the pool, which is
 * what stops a long run from offering a maxed common forever.
 *
 * @param {Object<string, number>} owned  stack count per upgrade id
 * @param {number} wave  the wave just cleared; gates rarity
 * @param {number} count how many totems to fill
 * @returns {string[]} upgrade ids. Shorter than `count` - possibly empty -
 *   once the pool runs dry, and the caller must cope with that.
 */
export function rollTotems(owned, wave, count = 3) {
  const pool = [];
  for (const key of UPGRADE_KEYS) {
    // Devil Deals are sold, never given. They share this map so they behave
    // like every other mutation once owned, but the free totems must never
    // offer one - a deal handed over for nothing is not a deal.
    if (UPGRADES[key].devil) continue;
    if ((owned[key] || 0) >= UPGRADES[key].max) continue;
    const w = rarityWeight(UPGRADES[key].rarity, wave);
    if (w > 0) pool.push([key, w]);
  }

  const picked = [];
  while (picked.length < count && pool.length) {
    let total = 0;
    for (const [, w] of pool) total += w;
    let r = Math.random() * total;
    let idx = pool.length - 1;
    for (let i = 0; i < pool.length; i++) {
      r -= pool[i][1];
      if (r <= 0) { idx = i; break; }
    }
    picked.push(pool[idx][0]);
    pool.splice(idx, 1);
  }
  return picked;
}

/**
 * Rolls the Devil's offer. The deal counterpart to rollTotems(), and drawn the
 * same way - without replacement, skipping anything already owned - with one
 * difference: the pool is FLAT. There are only thirteen deals and they are all
 * meant to be reachable, so weighting them against each other would just make
 * a third of the Devil's stock rare on top of already being expensive.
 *
 * Unlike the free pool this is NOT gated on the wave number. A wave-1 player
 * who cleared it untouched has earned the whole catalogue; what stops them
 * buying it is the price, which is the point of the Devil.
 *
 * @param {Object<string, number>} owned  stack count per upgrade id
 * @param {number} count how many pillars to fill
 * @returns {string[]} deal ids, shorter than `count` once the pool runs dry.
 */
export function rollDeals(owned, count = 3) {
  const pool = [];
  for (const key of UPGRADE_KEYS) {
    if (!UPGRADES[key].devil) continue;
    if ((owned[key] || 0) >= UPGRADES[key].max) continue;
    pool.push(key);
  }
  const picked = [];
  while (picked.length < count && pool.length) {
    const idx = (Math.random() * pool.length) | 0;
    picked.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return picked;
}

// What the nth reroll of a single Devil set costs, in MAX HP (n starts at 0):
// 2, 4, 8, 16. Doubling for the same reason rerollCost() doubles - it stops a
// player shopping the whole catalogue at one wave break - except the wallet
// here is a health bar, so the ceiling arrives a great deal faster. Reset when
// a fresh set rises.
export function dealRerollCost(n) {
  return 2 * Math.pow(2, n);
}

// Reroll price for the nth reroll of a single totem set (n starts at 0).
// Doubling is what stops credits from simply buying the best upgrade in the
// pool; the counter resets when a fresh set rises.
export function rerollCost(n) {
  return 150 * Math.pow(2, n);
}

// The one thing credits buy outright, sold from a station beside the totems.
// Healing and shields deliberately are not for sale: health is what upgrades
// and regeneration are for, and being able to buy safety flattened the wave.
export const AMMO_PURCHASE = {
  name: 'AMMO',
  detail: '+90 ROUNDS',
  // A refill has to compete with a reroll for the same wallet, so it is
  // priced like one: several waves' earnings, not pocket change.
  cost: 300,
  enabled: (player) => player.reserveAmmo < player.maxReserve,
  apply: (player) => {
    player.reserveAmmo = Math.min(player.maxReserve, player.reserveAmmo + 90);
  },
};

