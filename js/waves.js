// Wave composition and the difficulty curve. Pure data + maths: no three.js,
// no game state, no side effects. main.js calls waveConfig() once when a wave
// starts and reads the rest from it for the duration.
//
// FIXED SHAPE, RANDOM FILL
//
// The old version rolled every slot in the queue against one flat weight
// table, which meant one run could meet six tanks on wave 8 and the next six
// chasers. Two runs were not comparable, and reaching wave 12 measured luck
// as much as skill.
//
// So a wave's SHAPE is fixed and its CAST is not. Each wave declares how many
// enemies of each ROLE it contains - a pure function of the wave number, the
// same in every run that ever plays it - and the specific type filling each
// slot is drawn from the types of that role unlocked by then. The roles are
// built so their members are near-equivalent in threat: swapping a chaser for
// a wraith changes how the wave FEELS and not how hard it is.
//
// Adding a type to a role therefore has to be done on that basis. A type that
// is much stronger than its role-mates reintroduces exactly the luck this
// exists to remove.
//
// Arrival order is shuffled, because the order enemies walk in out of is
// texture rather than difficulty.

// Role membership. Peers within a role must be comparable in threat - see the
// note above.
const ROLES = {
  rusher: ['chaser', 'splitter', 'wraith', 'magma', 'cinder', 'rime'],
  gunner: ['shooter', 'sniper'],
  brute: ['tank', 'bulwark', 'husk'],
  artillery: ['bomber', 'blight', 'vitriol'],
  support: ['conduit', 'warden', 'howler', 'hexer'],
  // The one role whose members are not near-equivalent by accident but by
  // construction: a harrier will not close and a shrike does nothing else, so
  // whichever fills a slot the wave still contains "something in the air".
  flier: ['harrier', 'shrike', 'shade'],
};

// THE AFFLICTORS AND THE ROLE RULE.
//
// Six of the seven types added with the status system join existing roles, and
// every one of them was priced to sit inside its role rather than on top of
// it: a cinder hits for five where a chaser hits for twelve, a husk has a
// hundred and thirty health where a tank has a hundred and eighty, a vitriol
// does no direct damage at all - exactly like the blight it stands beside.
// What each one carries instead is a status, and the status is the payment for
// what was taken off its stat block.
//
// That is the whole reason the balance holds. A wave asks for four rushers,
// not for four chasers, and a run where three of them are cinders has to be
// the same difficulty as a run where none are. The moment an afflictor is
// simply a role-mate plus a debuff, the schedule stops being a fixed shape and
// goes back to being luck - which is the one thing this file exists to
// prevent.
//
// SUPPORT IS THE EXCEPTION WORTH NAMING. It now has four members and they are
// the least alike of any role: conduit and warden change what the CROWD does,
// howler and hexer change what the PLAYER does. They are still comparable in
// threat - each is a high-value target that does no damage of its own and
// makes everything around it worse - but a support slot is now a genuinely
// wider question than it was, which is why the schedule never asks for more
// than two of them.

// The wave a type first becomes eligible. Everything does NOT show up at once:
// a wave-1 player meets one enemy and learns it, and the roster opens a type
// at a time from there. A role with nothing unlocked yet simply cannot be
// scheduled, which is why the early slot table has no `brute` line.
export const FLIER_UNLOCK = 21;

const UNLOCK = {
  chaser: 1,
  splitter: 2,
  shooter: 3,
  bomber: 4,
  tank: 6,
  sniper: 7,
  wraith: 8,
  bulwark: 9,
  conduit: 11,
  blight: 12,
  magma: 13,
  warden: 14,
  // ---- the afflictors ----------------------------------------------------
  // One status at a time, and none of them before wave 10.
  //
  // Waves 1-12 are the hand-authored teaching schedule (see SLOTS), and what
  // they teach is the FLOOR: lanes, pools, telegraph circles, which enemy to
  // shoot first. A status is a second thing to read - a chip in the HUD, a
  // number that is no longer what it was - and stacking that on top of the
  // basics is how a player ends up learning neither.
  //
  // The order is by how much each one takes away. Fire and cold take a little
  // and are obvious about where they came from; fear takes the trigger; curse
  // takes nothing visible at all and multiplies everything else, which is why
  // it is last and why it arrives after the player has met all five of the
  // others.
  // Eleven, not ten: wave 10 is a boss, and a type whose first appearance is
  // as an add in a boss fight is a type the player meets while looking at
  // something else. Every one of these opens on an ordinary wave.
  cinder: 11,
  rime: 13,
  vitriol: 16,
  husk: 18,
  howler: 19,
  hexer: 23,
  // The air's afflictor waits until the player has had four waves of ordinary
  // fliers. Being feared on the ground is two seconds of walking; being feared
  // with something already diving is the dive.
  shade: 26,
  // The air opens the wave after the fourth boss. Not earlier: everything
  // before wave 20 is a lesson in reading the FLOOR - lanes, pools, telegraph
  // circles - and dropping a threat above the player's sight line while they
  // are still learning that would only teach them to look in the wrong place.
  harrier: FLIER_UNLOCK,
  shrike: FLIER_UNLOCK,
};

// ---- bosses --------------------------------------------------------------
// Every fifth wave, in a fixed rotation that repeats every 25. Wave 30 is
// Colossus again, wave 55 again after that.
export const BOSS_ROTATION = ['colossus', 'siege', 'schism', 'maw', 'herald'];

export function isBossWave(n) {
  return n > 0 && n % 5 === 0;
}

export function bossForWave(n) {
  return BOSS_ROTATION[(n / 5 - 1) % BOSS_ROTATION.length];
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
 */
export function bossScale(n) {
  return {
    hp: n <= 30 ? 1 + 0.13 * (n - 1) : 4.77 + 0.045 * (n - 30),
    dmg: 1 + 0.05 * (n - 1),
    speed: Math.min(1.35, 1 + 0.02 * (n - 1)),
    rate: Math.max(0.62, 1 - 0.012 * (n - 1)),
  };
}

// Adds keep arriving for as long as the boss lives, so these bound the
// pressure rather than a total. `maxAdds` is how many may be alive at once;
// wave 15 is lower because Schism splits into its own crowd.
function bossPressure(n) {
  const cycle = Math.floor((n - 1) / 25);
  const key = bossForWave(n);
  const base = key === 'schism' ? 3 : key === 'siege' || key === 'herald' ? 5 : 4;
  return {
    maxAdds: Math.min(7, base + cycle),
    addInterval: Math.max(2.2, 4.0 - cycle * 0.4),
  };
}

// ---- the schedule --------------------------------------------------------
// Slots per role, hand-authored through wave 12 and formula-driven after.
// Index is the wave number; boss waves are null because their composition
// comes from the trickle instead.
//
// EVERY NUMBER HERE IS A PURE FUNCTION OF THE WAVE NUMBER. That is what makes
// the wave a run reached mean the same thing in every run.
const SLOTS = [
  null,
  { rusher: 6 },
  { rusher: 7 },
  { rusher: 7, gunner: 3 },
  { rusher: 8, gunner: 3, artillery: 2 },
  null, //  5  BOSS colossus
  { rusher: 8, gunner: 4, brute: 1, artillery: 2 },
  { rusher: 9, gunner: 5, brute: 1, artillery: 2 },
  { rusher: 10, gunner: 5, brute: 2, artillery: 2 },
  { rusher: 10, gunner: 5, brute: 3, artillery: 3 },
  null, // 10  BOSS siege
  { rusher: 11, gunner: 6, brute: 3, artillery: 3, support: 1 },
  { rusher: 12, gunner: 6, brute: 3, artillery: 4, support: 1 },
];

// Past the authored range the mix holds steady and only the count grows, up to
// a ceiling the arena and the enemy cap can actually hold.
// Fliers, on top of the ground count rather than carved out of it. They are a
// NEW axis, not a reskin of an old one: taking rushers away to pay for them
// would leave the wave the same size and quietly easier, because a player who
// has already solved the floor trades a threat they must answer for one they
// can ignore. So the air is an addition, and waves past 20 are meant to be
// harder than the curve alone would have made them.
//
// One at a time to begin with. A pair of shrikes diving on the wave a player
// first meets them is the kind of introduction that reads as unfair rather
// than as new.
function fliersFor(n) {
  if (n < FLIER_UNLOCK) return 0;
  return Math.min(4, 1 + Math.floor((n - FLIER_UNLOCK) / 8));
}

function slotsFor(n) {
  const flier = fliersFor(n);
  if (n < SLOTS.length) return flier ? { ...SLOTS[n], flier } : SLOTS[n];
  const total = Math.min(34, 20 + Math.floor(n * 0.55));
  const support = Math.min(2, 1 + Math.floor((n - 11) / 12));
  const gunner = Math.round(total * 0.24);
  const brute = Math.round(total * 0.13);
  const artillery = Math.round(total * 0.14);
  // Rushers take the remainder so the GROUND total is exactly `total` however
  // the rounding above lands. `flier` sits outside that sum by design.
  const rusher = total - gunner - brute - artillery - support;
  const slots = { rusher, gunner, brute, artillery, support };
  if (flier) slots.flier = flier;
  return slots;
}

// The types of `role` that exist by wave n. Never empty for a role the
// schedule actually uses, because the slot table does not name a role before
// its first member unlocks.
function pickForRole(role, n) {
  const pool = ROLES[role];
  const open = [];
  for (const t of pool) {
    if (UNLOCK[t] <= n) open.push(t);
  }
  if (!open.length) return pool[0];
  return open[(Math.random() * open.length) | 0];
}

// Enemies in wave n. powerups.js derives its pickup count from this, so the
// two can't drift apart.
//
// A boss wave reports a nominal figure rather than zero: the real count is
// open-ended (adds arrive until the boss dies), and reporting zero would leave
// the fight with no pickups at all, which is when the player needs them most.
export function waveEnemyCount(n) {
  if (isBossWave(n)) return 16;
  const slots = slotsFor(n);
  let total = 0;
  for (const role in slots) total += slots[role];
  return total;
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

// Everything wave n needs. `queue` is a fresh array that main.js shifts from
// as it spawns; the scale factors multiply the base stats in ENEMY_TYPES.
// spawnInterval is seconds between spawns, floored so late waves stay sane.
//
// On a boss wave the queue is empty and `boss` is set: main.js spawns the boss
// and then trickles adds for as long as it lives.
export function waveConfig(n) {
  const hpScale = 1 + (n - 1) * 0.18;
  const speedScale = 1 + (n - 1) * 0.04;
  const dmgScale = 1 + (n - 1) * 0.05;
  const spawnInterval = Math.max(0.35, 1.1 - n * 0.05);

  if (isBossWave(n)) {
    const p = bossPressure(n);
    return {
      queue: [],
      hpScale,
      speedScale,
      dmgScale,
      spawnInterval,
      boss: true,
      bossKey: bossForWave(n),
      maxAdds: p.maxAdds,
      addInterval: p.addInterval,
    };
  }

  const slots = slotsFor(n);
  const queue = [];
  for (const role in slots) {
    for (let i = 0; i < slots[role]; i++) queue.push(pickForRole(role, n));
  }
  shuffle(queue);
  return {
    queue,
    hpScale,
    speedScale,
    dmgScale,
    spawnInterval,
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

export function pickAddType(n) {
  const roles = n >= FLIER_UNLOCK ? ADD_ROLES_AIR : ADD_ROLES;
  const role = roles[(Math.random() * roles.length) | 0];
  return pickForRole(role, n);
}
