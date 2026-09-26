import { discoverItems } from '../discover.js';

const discovered = await discoverItems('active', import.meta.url);
export const ACTIVE_ITEMS = discovered.items;
export const ACTIVE_ITEM_ICONS = discovered.icons;



// What one press of PAY TO WIN takes out of the bank. A FLAT thousand, not a
// price that climbs with the wave like the two consoles' do (see blockPrice in
// items/passive/index.js): those two are things the player buys once or twice a shop, and
// this is a thing they may press eight times in a row. A doubling cost would
// turn the joke into a sum.
export { PAY_TO_WIN_COST } from './shared.js';

// What one press of GOLDEN PARACHUTE takes out of the bank.
//
// FIVE TIMES PAY TO WIN'S, and flat for the same reason: it is the largest
// single price in the game and it has to stay a number the player can hold
// against their balance rather than a sum that changes with the wave. Five
// thousand competes with two first box rolls or five full ammo refills at
// early-wave prices; later it is one wave's takings, the curve an escape hatch
// should have.
export { PARACHUTE_COST } from './shared.js';

export const ACTIVE_ITEM_KEYS = Object.keys(ACTIVE_ITEMS);

// FOUR HUMOURS' cycle, in order. Read by _landShot in main.js, which owns the
// per-shot statuses already - putting the list here rather than there is what
// keeps the item's whole definition in one file, and the shot path only has to
// know that there IS a cycle, not what is in it.
//
// The four are deliberately WEAKER than the passive items that own them -
// Venom's poison is longer, Cryo's slow is longer, Incendiary burns harder.
// What the item sells is having all four at once, which no draft can assemble.
export const HUMOURS = [
  { status: 'burn', dur: 2.5, power: 9, color: 0xff5a00 },
  { status: 'slow', dur: 1.6, power: 0, color: 0x7fe3ff },
  { status: 'poison', dur: 3.5, power: 7, color: 0x39d353 },
  { status: 'arc', dur: 0, power: 0, color: 0xffee58 },
];

// ---------------------------------------------------------------------------
// THE RUNNING LIST
// ---------------------------------------------------------------------------
//
// Twenty-one of the eighty items do not finish on the frame they start.
// This is the four lines that make that possible, and it is deliberately the
// smallest thing that could: a list of activations, each holding the item that
// made it, its own scratch object and a clock. No registry, no ids to keep in
// step, no per-item bookkeeping anywhere else in the game.
//
// WHY A LIST AND NOT FIELDS ON THE PLAYER. The player already carries the
// MARKS an item leaves (itemDamageMult and its neighbours) because those have
// to be read by the shot path and the damage sinks, which have no idea items
// exist. What it must NOT carry is the item's own state - a stack count, a
// coin toss, a set of bodies already hit - because that is one field per item
// on a class that would then have to reset thirty-two of them.
//
// RE-FIRING REFRESHES, IT DOES NOT STACK. The same rule Player.applyStatus
// follows, for the same reason: two BLOOD PRICE windows at once would be nine
// times damage through a multiplier neither of them could correctly hand back,
// because whichever expired first would write 1 over the other's window.
export class RunningActiveItems {
  constructor() {
    this.list = [];
  }

  /**
   * Fires an item. `use` runs for every item; only one with a `duration` is
   * kept, and only a kept one ever sees tick, onKill or end.
   *
   * @param {object} game
   * @param {string} id   a key of ACTIVE_ITEMS
   * @param {object} def  ACTIVE_ITEMS[id]
   */
  start(game, id, def) {
    // Ended, not merely dropped: the old activation is holding a multiplier
    // and its end() is the only thing that gives it back.
    this.stop(game, id);
    const s = {};
    def.use(game, s);
    if (!(def.duration > 0)) return;
    this.list.push({ id, def, s, t: def.duration, full: def.duration });
  }

  // Ends one activation early, running its end() so nothing is left written on
  // the player. Silent if it was not running.
  stop(game, id) {
    for (let i = 0; i < this.list.length; i++) {
      if (this.list[i].id !== id) continue;
      const r = this.list[i];
      this.list.splice(i, 1);
      if (r.def.end) r.def.end(game, r.s);
      return;
    }
  }

  /**
   * One frame. Ticks BEFORE the expiry test so an item always gets a tick on
   * the frame it was started and never gets one after it has ended - which is
   * what lets SUTURE ENGINE's eight seconds actually heal forty rather than
   * thirty-nine and a bit.
   */
  update(game, dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const r = this.list[i];
      // Clamped, so a long frame cannot bill more healing, more damage or more
      // burning than the window actually had left in it.
      const step = Math.min(dt, r.t);
      if (r.def.tick) r.def.tick(game, r.s, step);
      r.t -= dt;
      // `s.done` IS THE ITEM SAYING IT IS OVER, and it is what keeps the HUD
      // chip honest for anything whose real payload is a COUNT rather than a
      // clock. HAEMOPHAGE is ten hits inside twenty seconds: the twenty is a
      // backstop, and once the tenth hit lands the effect is gone whatever the
      // clock says. A chip that outlived its own effect is the HUD lying about
      // what the player is carrying.
      if (r.t > 0 && !r.s.done) continue;
      this.list.splice(i, 1);
      if (r.def.end) r.def.end(game, r.s);
    }
  }

  // An enemy died. Walked rather than dispatched because there is at most a
  // handful of these and exactly one item currently cares.
  onKill(game) {
    for (const r of this.list) {
      if (r.def.onKill) r.def.onKill(game, r.s);
    }
  }

  /**
   * Everything down, now, running every end(). Called wherever the run's other
   * lingering state is cleared - the wave ending, a death, a restart, a versus
   * handover - because a triple-damage window that survived a wave boundary
   * would be a buff the player was never granted.
   */
  clear(game) {
    for (const r of this.list) {
      if (r.def.end) r.def.end(game, r.s);
    }
    this.list.length = 0;
  }

  // What the HUD strip draws: one chip per running item that asked for one,
  // carrying the item's OWN icon and theme - the same "one shape holds whether
  // it is standing on a totem or counting down in the corner" rule the Opening
  // Salvo chip already follows.
  chips(out) {
    out.length = 0;
    for (const r of this.list) {
      if (r.def.hud === false) continue;
      out.push({
        key: r.id,
        icon: r.id,
        color: r.def.theme,
        fraction: Math.max(0, Math.min(1, r.t / r.full)),
        label: r.s.label || '',
      });
    }
    return out;
  }
}

// WHAT A POINT OF ITEM CHARGE COSTS, in enemy value.
//
// ONE POINT IS ONE BASIC ENEMY. A chaser is worth 100 value, so at a hundredth
// of a point per value it pays exactly 1. That is the whole unit: an item's
// `charge` above is HOW MANY CHASERS IT COSTS. A three-point dash is three of
// them, the sixty-point items are sixty, and a tank at 300 value pays three at
// once because it is three chasers' worth of wave.
//
// ITEMS USED TO CHARGE ON THE CLOCK, one point per second of wave time, and
// that paid the player for taking longer: kiting the last enemy of a wave was
// the cheapest way to refill the dearest item in the pool. It is the same
// defect the bounty had when the kill chain multiplied it - see the note at the
// kill sweep in main.js - and it has the same answer. Charge is bought with
// DEAD ENEMIES now, and the only way to get more is to kill more.
//
// A FLAT RATE, DELIBERATELY, rather than a share of the wave. A share would
// mean the same chaser paid twelve times more on wave one than on wave
// twenty-six, when the wave-twenty-six one has five and a half times the health
// - less charge for strictly more work, which is backwards. The cost of a thing
// should not depend on where in the run you meet it.
//
// SO LATER WAVES DO GRANT MORE, and that is the intended trade: wave 1 is six
// enemies (~6 points) and wave 26 is thirty-five (~71). More enemies on the
// floor is exactly when a crowd-clear should come back more often. It is also
// bounded - `value` never scales with the wave and the ground count caps at 34
// - so it plateaus around wave 26 instead of running away.
//
// READ OFF `value` AND NEVER OFF THE MONEY DROPPED. value is a flat per-type
// figure with no multipliers on it, so Midas, the flawless streak and the melee
// double cannot reach the charge. Paying on the credits actually collected
// would have turned all three into cooldown reduction, and made the richest
// runs - the ones least in need of help - the fastest-charging ones.
export const CHARGE_PER_VALUE = 0.01;

// The most charge a boss wave's adds can be worth between them.
//
// THE ONE PLACE A FLAT RATE NEEDS A CEILING. Every other wave has a fixed cast,
// so killing more is simply not possible; a boss wave trickles adds for as long
// as the boss is alive, which makes "leave it standing and farm" a strategy
// again unless something stops it. Set at roughly what the nominal sixteen adds
// a boss wave is reckoned to be worth would pay, so a player who fights the
// wave normally never touches it and a player who stalls gets nothing for it.
export const BOSS_ADD_CHARGE_CAP = 24;

// The most segments the HUD meter is ever cut into.
//
// TWELVE, because past that the cells are thinner than the gaps between them
// and a bar nobody can count is a bar that has stopped being segmented. It is
// also about the largest number a player can read at a glance without counting,
// which is the only way this is ever read.
export const ITEM_BAR_MAX_CELLS = 12;

/**
 * How many segments an item's charge meter is cut into.
 *
 * ONE RULE, TWO BEHAVIOURS, and the second falls out of the first:
 *
 *   - Twelve points or less: one segment per point. A three-point item wears
 *     three fat blocks, so the segment WIDTH is itself a reading - the bar is
 *     always the same length, and a wide cell means a cheap item.
 *   - Longer than twelve: twelve segments, each worth `charge / 12` points.
 *
 * The caller lights `floor(frac * cells)` of them, which is what makes both
 * cases exact and keeps every segment whole. Under twelve that reduces to
 * `floor(pointsBanked)` - literally one cell per point earned - and over it the
 * cells are evenly spaced by construction at a rational fraction of the cost,
 * so a 13, 25, 27, 33 or 40 point item divides as evenly as twelve segments can
 * divide anything. Nothing here needs the cost to be a multiple of twelve, or
 * even to be a whole number of points.
 *
 * THE NUMBERS DID NOT MOVE WHEN THE UNIT DID. This used to be seconds, and the
 * costs are the same figures they always were - what changed is
 * what fills them, so the segmenting is untouched along with the ratios.
 *
 * @param {number} charge  points to fill
 * @returns {number} 1..ITEM_BAR_MAX_CELLS
 */
export function itemCells(charge) {
  return Math.max(1, Math.min(ITEM_BAR_MAX_CELLS, Math.ceil(charge)));
}

/**
 * The items a player could be given right now, in a random order.
 *
 * NEVER THE ITEM ALREADY CARRIED. A box that can hand back what is already in
 * the slot is a box that can charge two thousand dollars for nothing, and there
 * is no way for the player to see that coming. With sixty-six items and one
 * carried there are always sixty-five left, so this can never come up empty.
 *
 * THE EXCLUSION IS PER PLAYER AND COSTS NOTHING TO MAKE SO. Versus is hot seat:
 * one Player instance whose whole run - `item` included - is snapshotted and
 * restored at each handoff (see captureRun in versus.js). `carried` is therefore
 * always the ACTIVE player's item, and a box rolled by player two cannot know
 * or care what player one is holding. The caller passes `game.player.activeItem` and
 * that is the whole of it.
 *
 * SHUFFLED, NOT SAMPLED, because the box walks this list rather than rolling
 * against it once per tick. A walk cannot show the same item twice in a row -
 * which a per-tick roll does roughly once every thirty ticks, and it reads as
 * the reel having stuck - and over a long spin it shows the player a real
 * cross-section of what is in the box instead of the same four favourites.
 *
 * FLAT, and never gated on the wave. Every item in the pool is meant to be
 * reachable. A deep pool is already the thing a weighting would have been for,
 * and now that the box stands in every shop the pool is the only thing between
 * a run and its whole catalogue.
 *
 * @param {string|null} carried  the id in the player's slot, excluded
 * @returns {string[]} a fresh array, safe for the caller to keep and consume
 */
export function shuffledPool(carried) {
  const pool = ACTIVE_ITEM_KEYS.filter((k) => k !== carried);
  // Fisher-Yates, in place on the copy filter() just handed us.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    const t = pool[i];
    pool[i] = pool[j];
    pool[j] = t;
  }
  return pool;
}

/**
 * One item the player is not carrying. The single-draw form of the above, kept
 * for callers that want an item rather than a reel.
 *
 * @param {string|null} carried  the id in the player's slot, excluded
 * @returns {string} an item id
 */
export function rollItem(carried) {
  return shuffledPool(carried)[0];
}
