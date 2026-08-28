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
// of fire, cyan means armour. Reuse an existing entry rather than inventing a
// near-duplicate shade - the whole point is that the palette stays learnable.
export const THEME = {
  rate: 0xff9500,     // fire rate, attack speed
  ammo: 0xffd600,     // magazine, reserve, economy
  damage: 0xff3d00,   // raw damage
  vitality: 0x00e676, // healing, regeneration
  armor: 0x4ef3ff,    // max health, shields, retaliation
  mobility: 0x2979ff, // move and sprint speed
  blood: 0xff2d6f,    // lifesteal
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
    effects: [['+20% FIRE RATE', GOOD]],
    apply: (mods, n) => { mods.fireRate *= 1 + 0.2 * n; },
  },
  extendedMag: {
    name: 'EXTENDED MAG',
    rarity: 'common',
    max: 3,
    theme: THEME.ammo,
    effects: [['+50% MAGAZINE', GOOD]],
    apply: (mods, n) => { mods.magMult *= 1 + 0.5 * n; },
  },
  speedLoader: {
    name: 'SPEED LOADER',
    rarity: 'common',
    max: 3,
    theme: THEME.ammo,
    effects: [['-30% RELOAD TIME', GOOD]],
    apply: (mods, n) => { mods.reloadMult *= Math.pow(0.7, n); },
  },
  hollowPoint: {
    name: 'HOLLOW POINT',
    rarity: 'common',
    max: 3,
    theme: THEME.damage,
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
    theme: THEME.ammo,
    effects: [['+5 AMMO PER KILL', GOOD], ['+25% CREDITS', GOOD]],
    apply: (mods, n) => {
      mods.ammoOnKill += 5 * n;
      mods.creditMult *= 1 + 0.25 * n;
    },
  },
  combatStims: {
    name: 'COMBAT STIMS',
    rarity: 'common',
    max: 3,
    theme: THEME.mobility,
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
    effects: [['HEAL 4% OF DAMAGE', GOOD]],
    apply: (mods, n) => { mods.lifesteal += 0.04 * n; },
  },
  reactivePlating: {
    name: 'REACTIVE PLATING',
    rarity: 'rare',
    max: 3,
    theme: THEME.armor,
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
    theme: THEME.rate,
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
    theme: THEME.ammo,
    effects: [['+2.5 AMMO / SEC', GOOD]],
    apply: (mods, n) => { mods.ammoRegen += 2.5 * n; },
  },
  momentum: {
    name: 'MOMENTUM',
    rarity: 'rare',
    max: 2,
    theme: THEME.mobility,
    effects: [['UP TO +35% DAMAGE', GOOD], ['WHILE MOVING FAST', NOTE]],
    apply: (mods, n) => { mods.momentum += 0.35 * n; },
  },
  glassCannon: {
    name: 'GLASS CANNON',
    rarity: 'cursed',
    max: 1,
    theme: THEME.damage,
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
  // because low-rarity stat stacking is what a build is made of.
  if (rarity === 'rare') return Math.min(1, base + wave * 0.05);
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
  cost: 60,
  enabled: (player) => player.reserveAmmo < player.maxReserve,
  apply: (player) => {
    player.reserveAmmo = Math.min(player.maxReserve, player.reserveAmmo + 90);
  },
};

