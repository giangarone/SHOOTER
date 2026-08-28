// Roguelike upgrade pool and the between-wave draft roll.
//
// Pure data plus a weighted picker: no three.js, no DOM, no game state. Like
// waves.js, this module is a leaf - main.js rolls a draft, hands the chosen
// id to Run.take(), and the upgrade mutates player.mods from there.
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

export const RARITY = {
  common: { label: 'COMMON', color: '#9fb4d8', weight: 1 },
  rare: { label: 'RARE', color: '#4ef3ff', weight: 0.42 },
  cursed: { label: 'CURSED', color: '#ff3d00', weight: 0.3 },
};

// `desc` is shown on the card and is regenerated per stack, so it can report
// what THIS pick will add rather than the total.
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
 * Rolls `count` distinct upgrade options.
 *
 * @param {Object<string, number>} owned  stack count per upgrade id
 * @param {number} wave  the wave just cleared; gates rarity
 * @param {number} count how many cards to offer
 * @returns {string[]} upgrade ids, may be shorter than `count` if the pool
 *   runs dry (every remaining upgrade maxed out).
 */
export function rollDraft(owned, wave, count = 3) {
  // Eligible = not already at max stacks.
  const pool = [];
  for (const key of UPGRADE_KEYS) {
    if ((owned[key] || 0) >= UPGRADES[key].max) continue;
    const w = rarityWeight(UPGRADES[key].rarity, wave);
    if (w > 0) pool.push([key, w]);
  }

  const picked = [];
  // Draw without replacement: the chosen entry is spliced out so the same
  // upgrade can never fill two slots of one draft.
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

// Reroll price for the nth reroll of a single draft (n starts at 0). Doubling
// is what stops credits from being a way to simply shop for the best upgrade.
export function rerollCost(n) {
  return 50 * Math.pow(2, n);
}

// Flat consumables sold alongside the draft. `afford` gates the button and
// `apply` runs on purchase; both take the live player.
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

export const SHOP_KEYS = Object.keys(SHOP_ITEMS);
