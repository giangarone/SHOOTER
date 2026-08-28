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

// `desc` is shown on the reveal card and is regenerated per stack, so it can
// report what this particular stack added rather than the running total.
export const UPGRADES = {
  overclock: {
    name: 'OVERCLOCK',
    rarity: 'common',
    max: 5,
    desc: () => '+20% fire rate.',
    apply: (mods, n) => { mods.fireRate *= 1 + 0.2 * n; },
  },
  extendedMag: {
    name: 'EXTENDED MAG',
    rarity: 'common',
    max: 3,
    desc: () => '+50% magazine size.',
    apply: (mods, n) => { mods.magMult *= 1 + 0.5 * n; },
  },
  speedLoader: {
    name: 'SPEED LOADER',
    rarity: 'common',
    max: 3,
    desc: () => '−30% reload time.',
    apply: (mods, n) => { mods.reloadMult *= Math.pow(0.7, n); },
  },
  hollowPoint: {
    name: 'HOLLOW POINT',
    rarity: 'common',
    max: 3,
    desc: () => '+30% damage, −25% magazine size.',
    apply: (mods, n) => {
      mods.damage *= 1 + 0.3 * n;
      mods.magMult *= Math.pow(0.75, n);
    },
  },
  nanoweave: {
    name: 'NANOWEAVE',
    rarity: 'common',
    max: 2,
    desc: () => 'Regeneration starts sooner and heals faster.',
    apply: (mods, n) => {
      mods.regenDelay = Math.max(0.8, 4 - 1.25 * n);
      mods.regenRate = 5 * (1 + n);
    },
  },
  bulwark: {
    name: 'BULWARK',
    rarity: 'common',
    max: 3,
    desc: () => '+50 max health, −12% move speed.',
    apply: (mods, n) => {
      mods.maxHpBonus += 50 * n;
      mods.moveMult *= Math.pow(0.88, n);
    },
  },
  scavenger: {
    name: 'SCAVENGER',
    rarity: 'common',
    max: 3,
    desc: () => 'Kills drop 5 rounds. +25% credits.',
    apply: (mods, n) => {
      mods.ammoOnKill += 5 * n;
      mods.creditMult *= 1 + 0.25 * n;
    },
  },
  combatStims: {
    name: 'COMBAT STIMS',
    rarity: 'common',
    max: 3,
    desc: () => '+12% move speed, +10% sprint speed.',
    apply: (mods, n) => {
      mods.moveMult *= 1 + 0.12 * n;
      mods.sprintMult *= 1 + 0.1 * n;
    },
  },
  vampiric: {
    name: 'VAMPIRIC ROUNDS',
    rarity: 'rare',
    max: 3,
    desc: () => '4% of damage dealt returns as health.',
    apply: (mods, n) => { mods.lifesteal += 0.04 * n; },
  },
  reactivePlating: {
    name: 'REACTIVE PLATING',
    rarity: 'rare',
    max: 3,
    desc: () => 'Taking a hit detonates a shockwave around you.',
    apply: (mods, n) => {
      mods.shockwave += 45 * n;
      mods.shockwaveRadius = 5 + n;
    },
  },
  bloodlust: {
    name: 'BLOODLUST',
    rarity: 'rare',
    max: 2,
    desc: () => 'Each kill stacks +8% fire rate for 4s.',
    apply: (mods, n) => {
      mods.bloodlust += 0.08 * n;
      mods.bloodlustMax = 10;
    },
  },
  ammoFab: {
    name: 'AMMO FABRICATOR',
    rarity: 'rare',
    max: 3,
    desc: () => 'Reserve ammo regenerates continuously.',
    apply: (mods, n) => { mods.ammoRegen += 2.5 * n; },
  },
  momentum: {
    name: 'MOMENTUM',
    rarity: 'rare',
    max: 2,
    desc: () => 'Damage scales with your speed, up to +35%.',
    apply: (mods, n) => { mods.momentum += 0.35 * n; },
  },
  glassCannon: {
    name: 'GLASS CANNON',
    rarity: 'cursed',
    max: 1,
    desc: () => '+70% damage. Max health halved.',
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
 * Rolls one random upgrade for a wave clear.
 *
 * There is no choice offered - the roll IS the reward - so the weighting is
 * the only thing shaping a run. Upgrades already at their stack cap drop out
 * of the pool, which is what stops a long run from re-rolling the same maxed
 * common forever.
 *
 * @param {Object<string, number>} owned  stack count per upgrade id
 * @param {number} wave  the wave just cleared; gates rarity
 * @returns {string|null} an upgrade id, or null once everything is maxed.
 */
export function rollUpgrade(owned, wave) {
  const pool = [];
  let total = 0;
  for (const key of UPGRADE_KEYS) {
    if ((owned[key] || 0) >= UPGRADES[key].max) continue;
    const w = rarityWeight(UPGRADES[key].rarity, wave);
    if (w <= 0) continue;
    pool.push([key, w]);
    total += w;
  }
  if (!pool.length) return null;

  let r = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= pool[i][1];
    if (r <= 0) return pool[i][0];
  }
  return pool[pool.length - 1][0];
}

// Stock for the in-arena terminals (see terminals.js). `enabled` suppresses a
// purchase that would do nothing - a repair at full health - and `apply` runs
// on purchase. Both take the live player.
export const SHOP_ITEMS = {
  ammo: {
    name: 'AMMO',
    detail: '+90 reserve rounds',
    cost: 60,
    enabled: (player) => player.reserveAmmo < player.maxReserve,
    apply: (player) => {
      player.reserveAmmo = Math.min(player.maxReserve, player.reserveAmmo + 90);
    },
  },
  repair: {
    name: 'REPAIR',
    detail: 'restore 50 health',
    cost: 90,
    enabled: (player) => player.health < player.maxHealth,
    apply: (player) => {
      player.health = Math.min(player.maxHealth, player.health + 50);
    },
  },
  shield: {
    name: 'SHIELD',
    detail: '50 shield, 25s',
    cost: 140,
    enabled: () => true,
    apply: (player, time) => {
      player.shield = 50;
      player.shieldEnd = time + 25;
    },
  },
};

