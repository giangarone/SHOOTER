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
//   count, and an apply(). If it needs a stat that does not exist yet, add the
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
  // damage
  damage: 0xff3d00,
  precision: 0xff5fd2,
  glass: 0xcfe8ff,
  blast: 0xff6f00,
  ember: 0xbf360c,
  electric: 0xffee58,
  // staying alive
  vitality: 0x00e676,
  armor: 0x4ef3ff,
  shock: 0x00b0ff,
  holy: 0xfff2b0,
  ninelives: 0xea80fc,
  blood: 0xff2d6f,
  // movement
  mobility: 0x2979ff,
  surge: 0x536dfe,
  impact: 0x00e5c0,
  // status effects, matched to STATUS_TINT in enemy.js
  poison: 0x39d353,
  fire: 0xff5a00,
  ice: 0x7fe3ff,
  fear: 0x9d4edd,
  stone: 0x9aa5b1,
};


// `effects` is the totem's whole readout: two or three lines, each a short
// phrase and a sign. The sign is about GOOD vs BAD, not about the arithmetic -
// "-30% RELOAD TIME" is a benefit and so scores +1 and renders green.
//
//    1  benefit   (green)
//   -1  drawback  (red)
//    0  neutral qualifier, drawn dim
//
// Keep each line under about 22 characters. It is read at a glance, mid-run,
// from across the arena - a sentence is already too long.
const GOOD = 1;
const BAD = -1;
const NOTE = 0;

export const UPGRADES = {
  overclock: {
    name: 'OVERCLOCK',
    rarity: 'common',
    max: 5,
    theme: THEME.rate,
    icon: 'bolt',
    effects: [['+20% FIRE RATE', GOOD]],
    apply: (mods, n) => { mods.fireRate *= 1 + 0.2 * n; },
  },
  extendedMag: {
    name: 'EXTENDED MAG',
    rarity: 'common',
    max: 3,
    theme: THEME.ammo,
    icon: 'magazine',
    effects: [['+50% MAGAZINE', GOOD]],
    apply: (mods, n) => { mods.magMult *= 1 + 0.5 * n; },
  },
  speedLoader: {
    name: 'SPEED LOADER',
    rarity: 'common',
    max: 3,
    theme: THEME.brass,
    icon: 'shell',
    effects: [['-30% RELOAD TIME', GOOD]],
    apply: (mods, n) => { mods.reloadMult *= Math.pow(0.7, n); },
  },
  hollowPoint: {
    name: 'HOLLOW POINT',
    rarity: 'common',
    max: 3,
    theme: THEME.damage,
    icon: 'bullet',
    effects: [['+30% DAMAGE', GOOD], ['-25% MAGAZINE', BAD]],
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
    effects: [['2x HEAL RATE', GOOD], ['HEALS 2.5s SOONER', GOOD]],
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
    effects: [['+50 MAX HEALTH', GOOD], ['-12% MOVE SPEED', BAD]],
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
    icon: 'ammoBox',
    effects: [['+2 AMMO PER KILL', GOOD], ['+15% CREDITS', GOOD]],
    apply: (mods, n) => {
      mods.ammoOnKill += 2 * n;
      mods.creditMult *= 1 + 0.15 * n;
    },
  },
  combatStims: {
    name: 'COMBAT STIMS',
    rarity: 'common',
    max: 3,
    theme: THEME.mobility,
    icon: 'syringe',
    effects: [['+12% MOVE SPEED', GOOD], ['+10% SPRINT', GOOD]],
    apply: (mods, n) => {
      mods.moveMult *= 1 + 0.12 * n;
      mods.sprintMult *= 1 + 0.1 * n;
    },
  },
  vampiric: {
    name: 'VAMPIRIC ROUNDS',
    rarity: 'rare',
    max: 3,
    theme: THEME.blood,
    icon: 'drop',
    effects: [['HEAL 4% OF DAMAGE', GOOD]],
    apply: (mods, n) => { mods.lifesteal += 0.04 * n; },
  },
  reactivePlating: {
    name: 'REACTIVE PLATING',
    rarity: 'rare',
    max: 3,
    theme: THEME.shock,
    icon: 'spikeShield',
    effects: [['SHOCKWAVE WHEN HIT', GOOD], ['45 DAMAGE NEARBY', NOTE]],
    apply: (mods, n) => {
      mods.shockwave += 45 * n;
      mods.shockwaveRadius = 5 + n;
    },
  },
  bloodlust: {
    name: 'BLOODLUST',
    rarity: 'rare',
    max: 2,
    theme: THEME.frenzy,
    icon: 'claw',
    effects: [['+8% FIRE RATE / KILL', GOOD], ['STACKS TO 10', NOTE]],
    apply: (mods, n) => {
      mods.bloodlust += 0.08 * n;
      mods.bloodlustMax = 10;
    },
  },
  ammoFab: {
    name: 'AMMO FABRICATOR',
    rarity: 'rare',
    max: 3,
    theme: THEME.fabricate,
    icon: 'gear',
    effects: [['+2.5 AMMO / SEC', GOOD]],
    apply: (mods, n) => { mods.ammoRegen += 2.5 * n; },
  },
  momentum: {
    name: 'MOMENTUM',
    rarity: 'rare',
    max: 2,
    theme: THEME.surge,
    icon: 'chevron',
    effects: [['UP TO +35% DAMAGE', GOOD], ['WHILE MOVING FAST', NOTE]],
    apply: (mods, n) => { mods.momentum += 0.35 * n; },
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
  venom: {
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
    name: 'CRYO ROUNDS',
    rarity: 'rare',
    max: 1,
    theme: THEME.ice,
    icon: 'icicle',
    effects: [['HITS SLOW BY HALF', GOOD], ['THEIR SHOTS TOO, 3s', NOTE]],
    apply: (mods, n) => { mods.slowTime = 3 * n; },
  },
  terror: {
    name: 'TERROR',
    rarity: 'rare',
    max: 1,
    theme: THEME.fear,
    icon: 'skull',
    effects: [['HIT ENEMIES FLEE', GOOD], ['2s, CANNOT ATTACK', NOTE]],
    apply: (mods, n) => { mods.fearTime = 2 * n; },
  },
  petrify: {
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
    name: 'ARC ROUNDS',
    rarity: 'rare',
    max: 1,
    theme: THEME.electric,
    icon: 'bolt',
    effects: [['HITS ARC ONWARD', GOOD], ['40% DMG, ONE JUMP', NOTE]],
    apply: (mods, n) => {
      mods.chainDamage = 0.4 * n;
      mods.chainRange = 6;
    },
  },
  knockout: {
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
    name: 'TWENTY/TWENTY',
    rarity: 'rare',
    max: 1,
    theme: THEME.precision,
    icon: 'crosshair',
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

// Reroll price for the nth reroll of a single totem set (n starts at 0).
// Doubling is what stops credits from simply buying the best upgrade in the
// pool; the counter resets when a fresh set rises.
export function rerollCost(n) {
  return 50 * Math.pow(2, n);
}

// The one thing credits buy outright, sold from a station beside the totems.
// Healing and shields deliberately are not for sale: health is what upgrades
// and regeneration are for, and being able to buy safety flattened the wave.
export const AMMO_PURCHASE = {
  name: 'AMMO',
  detail: '+90 ROUNDS',
  // Ammo was the cheapest thing in the game and it competed with nothing:
  // topping up cost less than a quarter of a single reroll, so credits had no
  // real second use. At 120 a refill is a wave's earnings, not pocket change.
  cost: 120,
  enabled: (player) => player.reserveAmmo < player.maxReserve,
  apply: (player) => {
    player.reserveAmmo = Math.min(player.maxReserve, player.reserveAmmo + 90);
  },
};

