import { discoverItems } from '../discover.js';

export { effectLines } from './shared.js';

const discovered = await discoverItems('passive', import.meta.url);
export const PASSIVE_ITEMS = discovered.items;
export const PASSIVE_ITEM_ICONS = discovered.icons;
export const PASSIVE_ITEM_KEYS = Object.keys(PASSIVE_ITEMS);

// WAVETABLE's bank, in the order the card names. Read by _landShot in
// main.js, which owns every other per-hit status, and by the reload edge in
// Player.update, which owns the magazine - so putting the list here rather
// than in either file is what keeps the item's whole definition in one place.
//
// The four are deliberately a shade SHORTER than the dedicated picks that own
// them (Venom's poison is 4s, Cryo's slow 3s, Incendiary burns 3s, Terror
// flees 2s), exactly as FOUR HUMOURS' are: what the pick sells is having all
// four across four magazines, not any one of them at full strength.
// `power` is a multiplier on the shared status tick; slow and fear have no
// strength to scale and leave it at zero.
export const WAVETABLE = [
  { status: 'burn', dur: 2.5, power: 1, color: 0xff5a00 },  // FIRE
  { status: 'slow', dur: 2, power: 0, color: 0x7fe3ff },    // ICE
  { status: 'poison', dur: 3, power: 1, color: 0x39d353 },  // POISON
  { status: 'fear', dur: 1.5, power: 0, color: 0x9d4edd },  // FEAR
];


/**
 * Rolls the three passive items offered on a totem set.
 *
 * FLAT. Every passive item in the pool has exactly the same chance of appearing.
 *
 * IT USED TO BE WEIGHTED, three ways: commons at 1, rares at 0.42 climbing to
 * 0.7 with the wave, cursed at 0.3, with rares locked out before wave 2 and
 * cursed before wave 3. Two things were wrong with that. The player could not
 * see it - the totem stopped printing a rarity line long ago, so the weight
 * was a number that changed what they were offered and was never once stated -
 * and the labels had stopped describing the pool anyway: nearly every passive
 * item added since the pool doubled was filed 'rare' or 'cursed' because that
 * is what a passive item felt like, which left 'common' meaning "one of the
 * nine stat multipliers" rather than "likely". A flat draw says the one thing
 * the totems have always actually promised: here are three of them, taken from
 * everything there is.
 *
 * Drawn WITHOUT REPLACEMENT, so one passive item can never fill two totems of the
 * same set. Passive items already at their stack cap drop out of the pool, which is
 * what stops a long run from offering a maxed common forever.
 *
 * @param {Object<string, number>} owned  stack count per passive item id
 * @param {number} count how many totems to fill
 * @param {?Set<string>} seen  ids ALREADY OFFERED at this shop, excluded. A
 *   reroll is the player saying "not these"; showing one of them back is the
 *   console charging for the answer it already gave. Null on a fresh set.
 * @returns {string[]} passive item ids. Shorter than `count` - possibly empty -
 *   once the pool runs dry, and the caller must cope with that.
 */
export function rollTotems(owned, count = 3, seen = null) {
  const open = [];
  for (const key of PASSIVE_ITEM_KEYS) {
    if ((owned[key] || 0) >= PASSIVE_ITEMS[key].max) continue;
    open.push(key);
  }
  // THE EXCLUSION IS A PREFERENCE, NOT A GATE. If a shop has somehow shown
  // everything the player can still take, the next reroll offers the pool over
  // again rather than nothing: a set that fails to rise sinks the shop and
  // forfeits the pick, which is a run wedged by a rule that was only ever
  // meant to stop a reroll repeating itself. It takes about thirty rerolls at
  // one shop to get here and the thirtieth costs two thousand doubled
  // twenty-nine times, so nobody will - which is exactly why it must not be
  // the one path that breaks.
  let pool = seen ? open.filter((k) => !seen.has(k)) : open;
  if (!pool.length) pool = open.slice();

  // Fisher-Yates over the head of the list, which is a draw without
  // replacement and needs no weights to be one.
  const picked = [];
  const n = Math.min(count, pool.length);
  for (let i = 0; i < n; i++) {
    const j = i + ((Math.random() * (pool.length - i)) | 0);
    const t = pool[i];
    pool[i] = pool[j];
    pool[j] = t;
    picked.push(pool[i]);
  }
  return picked;
}

// PRICES CLIMB WITH THE RUN. Both consoles beside the totems charge off a
// base that steps up every five waves, so a wallet that grows with the wave
// count is still spending a real fraction of it at wave 40. The step is per
// BLOCK of five and not per wave: the price a player learned at the start of a
// block is the price for the whole block, and it moves at the same boundary
// the boss waves fall on.
//
// @param {number} wave  the wave being shopped at (1-based)
// @param {number} base  the wave 1-5 price
// @param {number} step  what each further block of five adds
function blockPrice(wave, base, step) {
  const block = Math.floor(Math.max(0, (wave || 1) - 1) / 5);
  return base + step * block;
}

// $2,000 at waves 1-5, $2,500 at 6-10, and $500 a block after that.
export const REROLL_BASE = 2000;
export const REROLL_STEP = 500;

// Reroll price for the nth reroll of a single totem set (n starts at 0).
// Doubling is what stops credits from simply buying the best passive item in the
// pool; the counter resets when a fresh set rises. The base it doubles from is
// the wave's, so the doubling and the block step compound.
export function rerollCost(n, wave = 1) {
  return blockPrice(wave, REROLL_BASE, REROLL_STEP) * Math.pow(2, n);
}

// $2,500 at waves 1-5, $3,000 at 6-10, and $500 a block after that.
export const BOX_BASE = 2500;
export const BOX_STEP = 500;

// WHAT ONE ROLL OF THE MYSTERY BOX COSTS, for the nth roll bought at a single
// shop (n starts at 0). It doubles on the same terms a reroll does, and for
// the same reason: standing at the box feeding it credits until it hands over
// the item you wanted is the shop answering a question you have already asked,
// and the second asking ought to cost more than the first. The counter is the
// box's own and resets when a fresh totem set rises - see TotemArea.boxRolls -
// so walking away and coming back next wave is what makes it cheap again.
//
// The base it doubles from is the wave's, so the doubling and the block step
// compound exactly as they do for rerolls.
export function boxCost(wave = 1, rolls = 0) {
  return blockPrice(wave, BOX_BASE, BOX_STEP) * Math.pow(2, rolls);
}

// $1,000 at waves 1-5, $1,250 at 6-10, and $250 a block after that. See
// blockPrice(): `cost` is a function of the wave, not a number, so every
// caller has to say which wave it is pricing for.
export const AMMO_BASE = 1000;
export const AMMO_STEP = 250;

export const AMMO_PURCHASE = {
  name: 'MAX AMMO',
  detail: 'FULL MAGAZINE + RESERVE',
  cost: (wave = 1) => blockPrice(wave, AMMO_BASE, AMMO_STEP),
  enabled: (player) => player.reserveAmmo < player.maxReserve
    || (player.mods.beltFedDream <= 0 && player.mag < player.magSize),
  apply: (player) => {
    const filledMagazine = player.mods.beltFedDream <= 0 && player.mag < player.magSize;
    player.reserveAmmo = player.maxReserve;
    player.mag = player.mods.beltFedDream > 0 ? player.maxReserve : player.magSize;
    // A reload left running would spend rounds from the reserve just filled.
    player.reloading = 0;
    if (filledMagazine) player.magFresh = true;
  },
};
