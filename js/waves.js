// Wave composition and the difficulty curve. Pure data + maths: no three.js,
// no game state, no side effects. main.js calls waveConfig() once when a wave
// starts and reads the rest from it for the duration.
//
// FIXED SHAPE, THEMED CAST
//
// A wave's SHAPE - how many enemies of each ROLE it contains - is a pure
// function of the wave number, the same in every run that ever plays it. That
// is what makes the wave a run reached mean the same thing twice, and every
// number in this file is written to keep it true.
//
// What fills each slot is NOT rolled per slot any more. It used to be: each
// slot drew independently from every type of that role unlocked by then, which
// gave a wave 14 made of a chaser, a rime, a husk and a warden - four
// unrelated silhouettes standing in the same room with nothing to say to each
// other.
//
// The run is now TEN BLOCKS OF FIVE WAVES and each block is ONE THEME (see
// themes.js). A block's four ordinary waves are filled entirely from that
// theme's six enemies - one per role, so the role decides the type outright -
// and its fifth wave is that theme's boss. The blocks are dealt in a random
// order per run, so one run opens on EMBER and the next on BRINE.
//
// SO THE ROLL MOVED UP A LEVEL. It happens once per block instead of once per
// slot, and what it decides is the whole character of five waves rather than
// the identity of one body in a crowd.
//
// WHERE DIFFICULTY COMES FROM, NOW THAT A TYPE HAS NO WAVE
//
// It comes from here and only from here: hpScale, speedScale and dmgScale are
// pure functions of the ABSOLUTE wave number, so a theme dealt into waves
// 26-30 arrives with the same enemies as one dealt into 1-5 and five times the
// health. Nothing in themes.js knows or cares where its block landed.
//
// The price is paid on the other side: because a theme can land anywhere,
// every theme's base stat blocks must be normalised against every other
// theme's, role by role. Ten rushers that are interchangeable, ten brutes that
// are interchangeable. That is the same role-parity rule this file has always
// had, widened from six pools to a ten-by-six grid, and it is enforced in
// test/themes.mjs rather than by good intentions.

import {
  THEMES, THEME_KEYS, ROLE_KEYS, blockPos, themeForWave, resolveRole, resolveBoss,
} from './themes.js';

// ---- bosses --------------------------------------------------------------
// Every fifth wave, and which boss it is comes from the block's theme rather
// than from a fixed rotation. Wave 5 used to be Colossus in every run that
// ever played; it is now whichever theme was dealt first.

export function isBossWave(n) {
  return n > 0 && n % 5 === 0;
}

/**
 * Boss stat multipliers for wave n. Applied to the base block in ENEMY_TYPES
 * the same way hpScale and friends are applied to a normal enemy.
 *
 * HP flattens after wave 30 and damage does not, on purpose. The upgrade pool
 * is finite, so a player's damage plateaus somewhere near four times the
 * starting rifle; a health bar that kept climbing linearly past that would
 * turn a wave-55 boss into eighty seconds of holding the trigger. Late-game
 * threat comes from `dmg` and from `rate` - up to 1.6x the attack frequency -
 * which make the fight harder to survive rather than longer to finish.
 *
 * UNCHANGED BY THE THEME REDESIGN, and that is the point: it is a function of
 * the wave, so it already scales whichever boss the deck put there.
 */
export function bossScale(n) {
  return {
    hp: n <= 30 ? 1 + 0.13 * (n - 1) : 4.77 + 0.045 * (n - 30),
    dmg: 1 + 0.05 * (n - 1),
    speed: Math.min(1.35, 1 + 0.02 * (n - 1)),
    rate: Math.max(0.62, 1 - 0.012 * (n - 1)),
  };
}

// How much company each boss keeps. Adds arrive for as long as the boss lives,
// so these bound the PRESSURE rather than a total: `maxAdds` is how many may
// be alive at once.
//
// Keyed by boss rather than by wave, because a boss no longer has a wave. A
// fight that makes its own crowd - Schism, which splits into one, and the
// Choir, which is three bodies from the start - carries fewer; a fight the
// player can walk away from carries more, because walking away is what the
// adds are there to stop.
const ADD_PRESSURE = {
  schism: 3,
  choir: 3,
  overgrowth: 3,   // it cannot move, so its adds ARE its reach
  colossus: 4,
  maw: 4,
  palecrown: 4,
  forge: 4,
  conductor: 4,    // its pylons already take up the floor
  siege: 5,
  herald: 5,
  broodqueen: 3,   // she raises her own - a hatch is worth two of anyone's adds
};
const ADD_PRESSURE_DEFAULT = 4;

// `cycle` is which pass through the deck this is - it climbs once per
// deck-length in waves (fifty at ten themes, fifty-five at eleven) rather
// than every twenty-five, because the deck is the theme list long now
// instead of five. Derived from the table's own length so a theme added to
// the game does not leave this behind as a quietly wrong constant.
function bossPressure(n, bossKey) {
  const cycle = Math.floor((n - 1) / (THEME_KEYS.length * 5));
  const base = ADD_PRESSURE[bossKey] || ADD_PRESSURE_DEFAULT;
  return {
    maxAdds: Math.min(7, base + cycle),
    addInterval: Math.max(2.2, 4.0 - cycle * 0.4),
  };
}

// ---- the schedule --------------------------------------------------------
//
// HOW MANY. The count curve is carried over from the hand-authored schedule
// unchanged, because it was tuned by playing and the theme redesign is about
// WHO arrives, not how many. Waves 1-12 are the authored ramp; past that the
// mix holds steady and only the count grows, up to a ceiling the arena and the
// enemy cap can actually hold. Boss waves are null - their composition comes
// from the trickle instead.
const GROUND_TOTAL = [
  null,
  6, 7, 10, 13, null,      //  1-5
  15, 17, 19, 21, null,    //  6-10
  24, 26,                  // 11-12
];

function groundTotal(n) {
  if (n < GROUND_TOTAL.length) return GROUND_TOTAL[n];
  return Math.min(34, 20 + Math.floor(n * 0.55));
}

// WHICH ROLES. This is what replaced the per-type unlock table.
//
// UNLOCK gated each type on the wave it first became eligible, and it did real
// work: a wave-1 player met one enemy and learned it, and the roster opened a
// type at a time from there. It cannot survive a random block order - a wave
// gate on EMBER's rusher is meaningless when EMBER may be wave 1 or wave 41 -
// so what it did has to be done by the BLOCK instead.
//
// Every block therefore teaches itself in the same shape: it opens on the
// theme's line troops and widens to the full six by its fourth wave. That also
// gives a block a readable arc - meet the theme, theme at full strength, boss -
// which the flat schedule never had.
const BREADTH = {
  1: ['rusher', 'gunner', 'artillery', 'brute'],
  2: ['rusher', 'gunner', 'artillery', 'brute', 'flier'],
  3: ['rusher', 'gunner', 'artillery', 'brute', 'flier', 'support'],
  4: ROLE_KEYS,
};

// THE OPENING BLOCK IS STILL A TUTORIAL, whatever theme it is.
//
// The ramp above is about learning a THEME. The first four waves of a run are
// about learning the GAME - what a lane is, what a telegraph circle means,
// that a pool on the floor is not scenery - and a player doing that for the
// first time should be looking at one thing at a time regardless of which
// theme the deck happened to deal first. So the opening block overrides the
// ramp with the old hand-authored one, which is theme-agnostic by
// construction: it names roles, and every theme has one of each.
const OPENING = {
  1: ['rusher'],
  2: ['rusher'],
  3: ['rusher', 'gunner'],
  4: ['rusher', 'gunner', 'artillery'],
};

// Two absolute floors on top of the ramp, because these two are about the
// PLAYER's learning curve rather than the theme's.
//
// Support is a high-value target that does no damage of its own and makes
// everything around it worse, and the answer to one is to stop shooting the
// crowd and go through it - a decision that means nothing to a player who has
// not yet learned to read a crowd.
const SUPPORT_FLOOR = 6;
// The air waits longer. Everything before it is a lesson in reading the FLOOR -
// lanes, pools, telegraph circles - and dropping a threat above the player's
// sight line while they are still learning that would only teach them to look
// in the wrong place. It used to wait until wave 21; it cannot wait that long
// now, because every theme has a flier and the first two blocks would never
// show theirs at all.
const FLIER_FLOOR = 11;

function rolesFor(n) {
  const pos = blockPos(n);
  const open = (n <= 4 ? OPENING[pos] : BREADTH[pos]) || [];
  return open.filter((r) => {
    if (r === 'support') return n >= SUPPORT_FLOOR;
    if (r === 'flier') return n >= FLIER_FLOOR;
    return true;
  });
}

// Fliers sit OUTSIDE the ground total by design. They are a NEW axis, not a
// reskin of an old one: taking rushers away to pay for them would leave the
// wave the same size and quietly easier, because a player who has already
// solved the floor trades a threat they must answer for one they can ignore.
//
// One at a time to begin with. A pair of divers on the wave a player first
// meets them is the kind of introduction that reads as unfair rather than new.
function fliersFor(n) {
  return Math.min(4, 1 + Math.floor((n - FLIER_FLOOR) / 12));
}

// Never more than two. Support is the role whose members are least alike -
// some change what the CROWD does and some change what the PLAYER does - so a
// support slot is a genuinely wide question, and three of them at once is more
// questions than a wave has room for.
function supportFor(n) {
  return Math.min(2, 1 + Math.max(0, Math.floor((n - 11) / 12)));
}

// THE MIX FLATTENS AS THE WAVE GROWS.
//
// Rushers used to take whatever was left after the other roles, which came to
// about half of every wave. That was fine when a rusher slot drew from six
// different types - the half was a mixed crowd. A theme has exactly ONE
// rusher, so the same maths now puts seventeen identical bodies on a wave-46
// floor, and a theme's brute and artillery become a garnish on it.
//
// So the other roles take a bigger share - but only where the problem is.
// Early waves are small: wave 6's "half" is seven rushers, which reads as a
// crowd rather than as a repeat, and loading it with brutes instead would make
// it markedly harder for no gain. The shift therefore RAMPS, from exactly the
// fractions that shipped at wave 6 to the flattened ones by wave 26.
//
// It is priced to hold difficulty, not just head count. Trading four rushers
// for one brute and one artillery on a 34-enemy wave moves the wave's total
// health by about two per cent, because a brute carries four rushers' worth of
// it - what changes is how many different things are on screen, which is the
// entire point.
function mixAt(n) {
  const t = Math.max(0, Math.min(1, (n - 6) / 20));
  //
  // WHERE THE SLOTS GO IS SET BY HEALTH, NOT BY TASTE. A brute carries four
  // rushers' worth of it, so paying for the flattening in brutes would make a
  // late wave eight per cent tougher on top of being flatter - the same wave
  // with a longer trigger pull, which is not what was wanted. Gunners and
  // artillery are cheap in health and expensive in ATTENTION, which is exactly
  // the currency a flatter wave is supposed to cost more of. The numbers below
  // land a 34-enemy wave on the same total health it had before the change,
  // shaped 13/9/7/5 instead of 17/8/5/4.
  return {
    gunner: 0.24 + 0.03 * t,
    brute: 0.13 + 0.02 * t,
    artillery: 0.14 + 0.06 * t,
  };
}

// Slots per role for wave n. A role the breadth ramp has not opened yet
// contributes nothing and its share falls to the rushers, so the GROUND total
// is exactly groundTotal(n) however the rounding lands.
function slotsFor(n) {
  const open = new Set(rolesFor(n));
  const total = groundTotal(n);
  const mix = mixAt(n);
  const slots = {};

  if (open.has('gunner')) slots.gunner = Math.round(total * mix.gunner);
  if (open.has('brute')) slots.brute = Math.round(total * mix.brute);
  if (open.has('artillery')) slots.artillery = Math.round(total * mix.artillery);
  if (open.has('support')) slots.support = supportFor(n);

  let used = 0;
  for (const r in slots) used += slots[r];
  slots.rusher = Math.max(1, total - used);

  if (open.has('flier')) slots.flier = fliersFor(n);
  return slots;
}

// Fisher-Yates. The counts are fixed; the ORDER they walk in out of is not,
// because arrival order is texture rather than difficulty.
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

/**
 * Everything wave n needs. `queue` is a fresh array that main.js shifts from
 * as it spawns; the scale factors multiply the base stats in ENEMY_TYPES.
 * spawnInterval is seconds between spawns, floored so late waves stay sane.
 *
 * On a boss wave the queue is empty and `boss` is set: main.js spawns the boss
 * and then trickles adds for as long as it lives.
 *
 * `seed` is the run's one theme seed - the deck is re-dealt from it on every
 * call rather than held anywhere, so this stays a pure function of (n, seed)
 * and there is no per-run state to get out of step with.
 *
 * `have` is a predicate saying which types actually exist, threaded through to
 * themes.js so a theme whose own enemies are not built yet borrows RUST's. It
 * is passed in rather than imported because this file must stay loadable with
 * no renderer.
 *
 * `force` pins every block to one theme. Debug and tests only - it is the only
 * way to see a given theme at a given wave without rerolling the run until the
 * deck cooperates, which matters most while the ten of them are being built.
 */
export function waveConfig(n, seed = 0, have = null, force = null) {
  const hpScale = 1 + (n - 1) * 0.18;
  const speedScale = 1 + (n - 1) * 0.04;
  const dmgScale = 1 + (n - 1) * 0.05;
  const spawnInterval = Math.max(0.35, 1.1 - n * 0.05);

  const themeKey = themeForWave(seed, n, force);
  const theme = THEMES[themeKey];
  const base = {
    theme: themeKey,
    themeName: theme.name,
    themeColor: theme.color,
    blockPos: blockPos(n),
    hpScale,
    speedScale,
    dmgScale,
    spawnInterval,
  };

  if (isBossWave(n)) {
    const bossKey = resolveBoss(themeKey, have);
    const p = bossPressure(n, bossKey);
    return {
      ...base,
      queue: [],
      boss: true,
      bossKey,
      maxAdds: p.maxAdds,
      addInterval: p.addInterval,
    };
  }

  const slots = slotsFor(n);
  const queue = [];
  for (const role in slots) {
    const type = resolveRole(themeKey, role, have);
    for (let i = 0; i < slots[role]; i++) queue.push(type);
  }
  shuffle(queue);
  return {
    ...base,
    queue,
    boss: false,
    bossKey: null,
    maxAdds: 0,
    addInterval: 0,
  };
}

// The roles a boss wave's trickle draws from, weighted toward pressure that
// works alongside a boss: enough rushers to keep the player moving, enough
// range to punish standing in one place, and no support (a conduit cannot buff
// a boss anyway, so it would just be a free kill).
const ADD_ROLES = ['rusher', 'rusher', 'rusher', 'gunner', 'gunner', 'artillery'];
// Once the air is open, boss adds draw from it too - at one slot in seven, so
// a boss fight gains an occasional flier rather than a screen full of them on
// top of everything the boss is already doing.
const ADD_ROLES_AIR = [...ADD_ROLES, 'flier'];

// Adds come from the boss's OWN theme, so a boss fight is still that theme's
// fight - the EMBER boss is fought in a room filling up with EMBER.
export function pickAddType(n, seed = 0, have = null, force = null) {
  const roles = n >= FLIER_FLOOR ? ADD_ROLES_AIR : ADD_ROLES;
  const role = roles[(Math.random() * roles.length) | 0];
  return resolveRole(themeForWave(seed, n, force), role, have);
}
