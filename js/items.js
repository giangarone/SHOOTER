// ACTIVE ITEMS: the one thing in the run with a button on it.
//
// Everything else the player collects is a mutation - a number folded into the
// stat block that then applies itself forever, without being asked. An active
// item is the opposite: it does nothing at all until it is fired, and firing it
// is a decision made at a particular second of a particular fight. One slot,
// one button, no menu.
//
// THE SLOT IS ONE DEEP, AND THAT IS THE FEATURE. Taking a second item throws
// the first away. A run therefore carries an answer to ONE problem - the health
// bar, the crowd, the boss, the corner you got caught in - and swapping is a
// real loss rather than an inventory chore. There is no drop, no swap-back and
// no stash, for the same reason there is no upgrade menu: nothing in this game
// opens.
//
// THE CHARGE IS PAID IN WAVE TIME. `Player.update` fills the bar only while a
// wave is actually running (see the note at that branch), so an item cannot be
// topped up by standing still in the shop. It can still be FIRED in the shop -
// gating the use as well would be a rule the player has to discover by being
// punished for it, and there is nothing in the shop worth firing at anyway.
//
// EACH ITEM IS ONE `use(game)` AND NOTHING ELSE. None of the five reaches for
// machinery that did not already exist: the heal is the health pickup's sum,
// the freeze is the status every cryo round applies, the damage window is the
// rage pickup's own timer field, the invulnerability is the window a dodge used
// to open, and the dash is the dash. An item that needed a new system would be
// a system with one caller.

import { THEME } from './upgrades.js';
import { Totem, Station, ROW_Z } from './totems.js';

// The lines under an item's name on its pedestal, in the same vocabulary
// upgrades.js uses - 1 benefit, 0 qualifier. An item has no drawbacks to draw
// in red: what it costs is the slot, and the slot is not on the card.
const GOOD = 1;
const NOTE = 0;

// WHAT AN ITEM'S READOUT DOES NOT SAY: how long it takes to charge.
//
// It is the most quotable number an item has and it is deliberately nowhere -
// not on the pedestal, not in the prompt, not in the HUD. The bar already
// answers it, in the only unit it is ever thought about in: one segment is one
// second, so a glance at the slot says "three blocks" or "twenty hairlines"
// without a number, and the answer arrives from having carried the thing rather
// than from having read it. A player choosing between a heal and a dash should
// be weighing what they do, and a printed "20s" makes that a sum instead.

/**
 * The pool. Five, deliberately - enough that the pedestal is not the same offer
 * every time, few enough that a player learns all of them inside two runs and
 * a swap is a decision between things they know.
 *
 * @property {string} name      shown on the pedestal and in the HUD slot
 * @property {number} cooldown  seconds of WAVE TIME to refill, and the bar
 * @property {number} theme     colour, following THEME's rule: what it DOES
 * @property {Array}  effects   the pedestal's readout, [text, sign] per line
 * @property {Function} use     (game) => void, run once when the button lands
 *
 * The key is also the icon key - the catalogue in pixelicons.js is keyed by id
 * exactly the way the upgrade pool is, so two items cannot collide on one
 * drawing and a typo is a missing key rather than a silent substitution.
 */
export const ACTIVE_ITEMS = {
  itemHeal: {
    name: 'TRAUMA KIT',
    cooldown: 20,
    theme: THEME.vitality,
    // NO OVERHEAL, unlike the health pickup, which goes 25 over the cap. A
    // pickup has to be walked to across a live arena and this is a button, so
    // the button is the weaker of the two at the thing they both do. Twenty
    // seconds is most of a wave: it is one recovery per fight, not a tap.
    effects: [['HEAL 25 HP', GOOD]],
    use: (game) => {
      const p = game.player;
      p.health = Math.min(p.maxHealth, p.health + 25);
      game.effects.shockwave(p.pos, THEME.vitality, 5, 0.5);
    },
  },
  itemFreeze: {
    name: 'CRYO PULSE',
    cooldown: 10,
    theme: THEME.ice,
    // The whole floor at once, through the same per-enemy status a cryo round
    // applies - which means bosses downgrade it to a slow through the
    // resistance block they already carry (see freezeSlow in enemy.js). That is
    // the correct answer and not a special case: an item that could stop a boss
    // dead for two seconds every ten would be the only boss strategy there is.
    //
    // The cheapest cooldown in the pool because it does no damage. It buys
    // distance, and distance is what the player then has to use - and the
    // player finds that out by carrying it, not by reading it.
    effects: [['FREEZE ALL ENEMIES', GOOD], ['FOR 2s', NOTE]],
    use: (game) => {
      for (const e of game.enemies) e.applyStatus('freeze', 2);
      game.effects.shockwave(game.player.pos, THEME.ice, 26, 0.9);
    },
  },
  itemRage: {
    name: 'OVERDRIVE',
    cooldown: 20,
    theme: THEME.damage,
    // Rides damageBoostEnd, the same field the RAGE pickup uses, so it expires
    // through machinery that already exists and shows in the buff strip without
    // being taught to. Math.max against whatever is already running, because a
    // rage pickup landing on top of this must not DOWNGRADE it to 1.5x - the
    // shorter of two overlapping boosts still wins the expiry, which is the
    // honest reading of "for 5 seconds".
    effects: [['2x DAMAGE FOR 5s', GOOD]],
    use: (game) => {
      const p = game.player;
      p.damageMult = Math.max(p.damageMult, 2);
      p.damageBoostEnd = Math.max(p.damageBoostEnd, game.time + 5);
      game.effects.shockwave(p.pos, THEME.damage, 6, 0.6);
    },
  },
  itemGuard: {
    name: 'AEGIS',
    cooldown: 20,
    theme: THEME.holy,
    // invulnEnd is read as the FIRST line of both damage sinks in main.js, so
    // this needs no new guard anywhere - but both of those sinks return in
    // silence, which means five seconds of it look exactly like five seconds of
    // not being shot at. The tell is the caller's job: main.js holds a vignette
    // and a buff chip for the duration, or the strongest item in the pool is
    // also the one the player cannot tell is running.
    effects: [['INVINCIBLE FOR 5s', GOOD]],
    use: (game) => {
      const p = game.player;
      p.invulnEnd = Math.max(p.invulnEnd, game.time + 5);
      game.effects.shockwave(p.pos, THEME.holy, 7, 0.7);
    },
  },
  itemDash: {
    name: 'BLINK DRIVE',
    cooldown: 3,
    theme: THEME.surge,
    // THE DASH USED TO BE A MUTATION. Double Dash held two charges on a 2.5s
    // timer and was fired by double-tapping W, which is a binding that exists
    // because the game had no spare finger - and an active item slot IS a spare
    // finger. So it moved here whole: the envelope, the distance and the
    // forward-only commitment are untouched (see DASH_TIME in player.js), and
    // what changed is that it is now competing with a heal and a panic button
    // for the same slot rather than sitting in the pool for free.
    //
    // Three seconds, against Double Dash's two charges at 2.5s. A single charge
    // that comes back fast reads as mobility; two charges that come back slowly
    // read as an escape saved for the worst moment, and the four items above
    // already cover the worst moment.
    effects: [['DASH FORWARD', GOOD]],
    use: (game) => {
      game.player.dash(game.time);
    },
  },
};

export const ACTIVE_ITEM_KEYS = Object.keys(ACTIVE_ITEMS);

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
 *   - Twelve seconds or less: one segment per second. A three-second item wears
 *     three fat blocks, so the segment WIDTH is itself a reading - the bar is
 *     always the same length, and a wide cell means a short cooldown.
 *   - Longer than twelve: twelve segments, each worth `cooldown / 12` seconds.
 *
 * The caller lights `floor(frac * cells)` of them, which is what makes both
 * cases exact and keeps every segment whole. Under twelve that reduces to
 * `floor(secondsCharged)` - literally one cell per elapsed second - and over it
 * the cells are evenly spaced by construction at a rational fraction of the
 * cooldown, so a 13s, 25s, 27s, 33s or 40s item divides as evenly as twelve
 * segments can divide anything. Nothing here needs the cooldown to be a
 * multiple of twelve, or even to be a whole number of seconds.
 *
 * @param {number} cooldown  seconds to charge
 * @returns {number} 1..ITEM_BAR_MAX_CELLS
 */
export function itemCells(cooldown) {
  return Math.max(1, Math.min(ITEM_BAR_MAX_CELLS, Math.ceil(cooldown)));
}

/**
 * Rolls the pedestal's offer.
 *
 * NEVER THE ITEM ALREADY CARRIED. A pedestal offering what is already in the
 * slot is a pedestal with nothing on it: taking it does nothing and the reroll
 * is the only move, which makes the whole visit a formality. With five items
 * and one carried there are always four left, so this can never come up empty.
 *
 * Flat, and never gated on the wave. There are only five and they are all meant
 * to be reachable; weighting them would make three of them rare on top of only
 * turning up every third shop.
 *
 * @param {string|null} carried  the id in the player's slot, excluded
 * @returns {string} an item id
 */
export function rollItem(carried) {
  const pool = ACTIVE_ITEM_KEYS.filter((k) => k !== carried);
  return pool[(Math.random() * pool.length) | 0];
}

// ---------------------------------------------------------------------------
// THE ROW
// ---------------------------------------------------------------------------
//
// One pedestal on the far side of the arena, framed by two consoles. It stands
// where the Devil's three deals used to (same z, same console spacing, and the
// arena furniture was already moved out of its way - see the platform list in
// arena.js), because that walk is the point: the mutation totems are on the
// near side, and going to the far row is a choice to spend the wave break on
// something other than the pick that ends it.
//
// ONE OFFER, NOT THREE. Three deals were a shop; one item is a decision. With a
// single slot to put it in, a row of three would be asking the player to
// compare three things they can only have one of, at a wave break, having
// already picked a mutation - and the second and third would exist only to be
// walked past.
//
// EVERY THIRD SHOP. Often enough that a run sees three or four of them, rare
// enough that the row rising is an event and the walk is worth making. The
// count lives on the game (see `shopCount` in main.js), not here.

export const ITEM_ROW_Z = -ROW_Z + 4.5; //  9.5
// MAX HEALTH on the left, REROLL on the right, at the same spacing the totem
// row uses so all four consoles in the game stand in one arrangement.
//
// THE SIGNS ARE THE OPPOSITE WAY ROUND TO THE TOTEM ROW'S, and deliberately.
// That row sits at z = -5 and is walked up to from +z; this one sits at z = 9.5
// and is walked up to from -z, so the player is facing the other way and world
// -x is on their RIGHT here where it is on their left there. Left and right are
// the player's, not the arena's - a console that swapped sides depending on
// which row you were standing at would be the kind of thing nobody can name and
// everybody misreads.
const ITEM_STATION_X = { maxhp: 6.9, reroll: -6.9 };

// Max-health purchases allowed per visit. Three, and the row only comes up
// every third shop, so this is the whole of a run's supply of bought-back
// health - which is what keeps Executioner's fifty a price rather than a loan.
const MAX_HEALTH_BUYS = 3;

/**
 * Owns the whole active-item installation. main.js holds exactly one, built at
 * startup and reused for every visit - the same contract TotemArea has, and the
 * same method names, so main.js drives the two the same way.
 */
export class ItemArea {
  constructor(scene) {
    // A pedestal IS a Totem, at a different z with a doubled floor ring and an
    // ACTIVE ITEM line on its panel. A Totem already owns the rise, the arm
    // delay, the orbiting icon, the canvas panel and the single invisible claim
    // box - all of which a pedestal needs and none of which should exist twice.
    this.pedestal = new Totem(0, scene, ITEM_ROW_Z);
    // Re-tagged. A Totem tags its claim box `userData.totem`, and main.js's
    // shoot() reads that tag to decide what a pellet just bought - a pedestal
    // routed through _claimTotem() would try to grant an item as a mutation.
    // The tag is the only thing that separates the two, so it is swapped here
    // rather than adding a "which kind am I" field to Totem.
    this.pedestal.hit.userData.totem = null;
    this.pedestal.hit.userData.item = this.pedestal;

    this.healthStation = new Station(ITEM_STATION_X.maxhp, 'maxhp', scene, ITEM_ROW_Z);
    this.rerollStation = new Station(ITEM_STATION_X.reroll, 'itemReroll', scene, ITEM_ROW_Z);
    this.stations = [this.healthStation, this.rerollStation];

    // Rerolls bought against the CURRENT offer; reset every time a fresh one
    // rises. Priced in credits at the mutation reroll's own rate, and doubling
    // the same way, on its own counter - see _itemRerollCost in main.js.
    this.rerolls = 0;
    // Max-health buys spent this visit, capped at MAX_HEALTH_BUYS.
    this.healthBuys = 0;
  }

  // True while any part of the installation is still standing.
  get active() {
    return this.pedestal.state !== 'hidden' || this.stations.some((s) => s.state !== 'hidden');
  }

  // Whether the max-health console is standing and unspent. main.js asks
  // before it charges, and asks again to draw the label.
  get healthAvailable() {
    return this.healthStation.isUp() && this.healthBuys < MAX_HEALTH_BUYS;
  }

  // True once the item has been taken. Unlike a totem claim this does NOT end
  // the wave break - it just closes this row.
  get claimed() {
    return this.pedestal.claimed;
  }

  /**
   * Raises the pedestal and its two consoles.
   *
   * @param {object} offer  from _buildItem() in main.js, carrying
   *   `kind: 'item'` so the pedestal draws itself as one.
   * @param {boolean} resetRerolls  false when this IS a reroll, so the
   *   escalating price is not reset by the offer it just paid for.
   */
  present(offer, resetRerolls = true) {
    if (resetRerolls) {
      this.rerolls = 0;
      // A reroll re-presents the offer and must NOT hand the allowance back:
      // the console is spent for the visit, not for the offer.
      this.healthBuys = 0;
    }
    this.pedestal.present(offer);
    for (const st of this.stations) {
      if (st === this.healthStation && this.healthBuys >= MAX_HEALTH_BUYS) continue;
      st.show();
    }
  }

  dismiss() {
    this.pedestal.sink();
    for (const st of this.stations) st.sink();
  }

  // One max-health purchase. The console stays up for the second and third and
  // then sinks on the spot - there is no counter anywhere, so the allowance is
  // read off the console itself: it is there until it is not. The count is also
  // what stops present() raising it again on a reroll once it is spent.
  spendHealth() {
    this.healthBuys++;
    if (this.healthBuys >= MAX_HEALTH_BUYS) this.healthStation.sink();
  }

  // The pedestal, if the player could press E on it. Same contract and same
  // shape as TotemArea.usable(), so main.js can rank both rows against each
  // other in one pass - there is only ever one candidate here.
  usable(playerPos) {
    const p = this.pedestal;
    if (!p.canUse()) return null;
    const d2 = p.useDistance(playerPos);
    return d2 < 0 ? null : { target: p, d2 };
  }

  // The nearer of the two consoles in E range. Same contract as
  // TotemArea.stationInRange().
  stationInRange(playerPos) {
    let best = null;
    let bestD = Infinity;
    for (const st of this.stations) {
      if (!st.isUp()) continue;
      const d = st.useDistance(playerPos);
      if (d < 0 || d >= bestD) continue;
      bestD = d;
      best = st;
    }
    return best ? { target: best, d2: bestD } : null;
  }

  // Appends this row's shootable parts to a raycast target list: the pedestal's
  // invisible claim box plus the two console bodies.
  addTargets(out) {
    if (this.pedestal.state !== 'hidden') out.push(this.pedestal.hit);
    for (const st of this.stations) {
      if (st.state !== 'hidden') out.push(st.hit);
    }
  }

  update(dt, time, playerPos) {
    this.pedestal.update(dt, time, playerPos);
    for (const st of this.stations) st.update(dt, time, playerPos);
  }
}
