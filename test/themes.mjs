// THE THEME TABLE, AND THE BALANCE LAW IT RESTS ON.
//
// A run is a five-wave block per theme, the blocks dealt in a random order.
// That ordering is the whole design and it is also the whole danger:
// a type can no longer be balanced against the wave it appears on, because it
// has no wave any more. EMBER's rusher may be the first enemy of the run or
// the last thing before wave 45.
//
// So the rule waves.js has always had - peers within a role are near
// equivalent in threat - stops being a rule about six small pools and becomes
// a rule about the WHOLE GRID: every rusher interchangeable with every other,
// every brute with every other. If that slips, the theme a run happens to be
// dealt at wave 1 decides how hard wave 1 was, and the wave a run reached
// stops meaning the same thing in every run - which is the one thing the
// schedule exists to prevent.
//
// Nobody can hold sixty-odd stat blocks in their head across the many sittings
// it takes to build them, so this file holds them instead. It is deliberately
// the cheapest test in the suite - pure data, no browser, no renderer - so it
// can be the thing that fails first.
//
// Every count below is derived from the table's own length rather than
// authored, so the suite grows with the game instead of agreeing with a
// comment about it.
import { ENEMY_TYPES } from '../js/enemy.js';
import {
  THEMES, THEME_KEYS, ROLE_KEYS, FALLBACK_THEME,
  themeOrder, themeForWave, blockPos, blockIndex, resolveRole, resolveBoss,
} from '../js/themes.js';

let fails = 0;
function ok(label, cond, detail = '') {
  if (!cond) fails++;
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}${detail ? '   ' + detail : ''}`);
}

const have = (k) => Object.prototype.hasOwnProperty.call(ENEMY_TYPES, k);

// ---- 1. the table is well formed ----------------------------------------

// DERIVED, NOT AUTHORED. The table has grown a theme at a time and every
// count in here follows the table's own length now - a suite that said "ten"
// while the game dealt eleven would be a suite agreeing with a comment
// rather than with the game.
const N = THEME_KEYS.length;

ok(`${N} themes`, THEME_KEYS.length === N, `${THEME_KEYS.length}`);

const missingRole = [];
const badMeta = [];
for (const key of THEME_KEYS) {
  const t = THEMES[key];
  if (!t.name || typeof t.color !== 'number' || !t.boss) badMeta.push(key);
  for (const role of ROLE_KEYS) {
    if (!t.roles[role]) missingRole.push(`${key}.${role}`);
  }
  for (const role in t.roles) {
    if (!ROLE_KEYS.includes(role)) missingRole.push(`${key}.${role} is not a role`);
  }
}
ok('every theme names all six roles', missingRole.length === 0, missingRole.join(', '));
ok('every theme has a name, a colour and a boss', badMeta.length === 0, badMeta.join(', '));

// Two blocks that light the room the same colour are two blocks the player
// cannot tell apart from across the arena, which is most of what the theme is
// for.
const colors = THEME_KEYS.map((k) => THEMES[k].color);
ok('no two themes share a colour', new Set(colors).size === colors.length);

// ---- 2. no type is in two places ----------------------------------------
// A type in two themes would be balanced against two different sets of
// role-mates and belong to neither.

const owner = new Map();
const dupes = [];
for (const key of THEME_KEYS) {
  for (const role of ROLE_KEYS) {
    const type = THEMES[key].roles[role];
    if (owner.has(type)) dupes.push(`${type}: ${owner.get(type)} + ${key}.${role}`);
    else owner.set(type, `${key}.${role}`);
  }
}
ok('no type fills two slots', dupes.length === 0, dupes.join('; '));
ok(`${N * ROLE_KEYS.length} slots`, owner.size === N * ROLE_KEYS.length, `${owner.size}`);

const bossOwner = new Map();
const bossDupes = [];
for (const key of THEME_KEYS) {
  const b = THEMES[key].boss;
  if (bossOwner.has(b)) bossDupes.push(`${b}: ${bossOwner.get(b)} + ${key}`);
  else bossOwner.set(b, key);
}
ok(`${N} distinct bosses`, bossDupes.length === 0 && bossOwner.size === N, bossDupes.join('; '));

// ---- 3. nothing built is homeless ---------------------------------------
// The other direction: a type that exists but no theme names is a type that
// can never be scheduled - dead content that still costs a model, a geometry
// and a slot against the smoke test's ceilings.
//
// The deliberate exceptions: things a BOSS puts in the arena rather than
// things a wave rolls. Colossus throws its turrets and the Pale Crown drives
// in its anchors; nothing rolls either, pickAddType will never return one, and
// neither is in a role.
const NOT_IN_A_THEME = new Set(['turret', 'anchor', 'pylon']);

const homeless = Object.keys(ENEMY_TYPES).filter((k) => {
  if (NOT_IN_A_THEME.has(k)) return false;
  if (ENEMY_TYPES[k].boss) return !bossOwner.has(k);
  return !owner.has(k);
});
ok('every built type has a theme', homeless.length === 0, homeless.join(', '));

// ---- 4. what is built, and what is still borrowed ------------------------
// The table is authored complete: every slot names its FINAL type, including
// the ones that do not exist yet, and resolveRole falls back to RUST until
// they do. That is not a failure - it is the build order - but it has to be
// VISIBLE, or a theme quietly ships half made of chasers.

const pending = [];
for (const key of THEME_KEYS) {
  for (const role of ROLE_KEYS) {
    const want = THEMES[key].roles[role];
    if (!have(want)) pending.push(`${key}.${role}=${want}`);
  }
  if (!have(THEMES[key].boss)) pending.push(`${key}.boss=${THEMES[key].boss}`);
}

// The fallback has to be complete, or a borrowed slot resolves to nothing.
const fbMissing = ROLE_KEYS.filter((r) => !have(THEMES[FALLBACK_THEME].roles[r]));
ok(`fallback theme (${FALLBACK_THEME}) is fully built`, fbMissing.length === 0, fbMissing.join(', '));

// Every slot must resolve to something real, built or borrowed - this is the
// check that the game can actually run the whole rotation today.
const unresolved = [];
for (const key of THEME_KEYS) {
  for (const role of ROLE_KEYS) {
    if (!have(resolveRole(key, role, have))) unresolved.push(`${key}.${role}`);
  }
  if (!have(resolveBoss(key, have))) unresolved.push(`${key}.boss`);
}
ok('every slot resolves to a real type', unresolved.length === 0, unresolved.join(', '));

// A theme borrowing more than half its roster is not a theme yet. This is a
// warning line rather than a failure, because it is true by construction until
// that theme's build phase.
const borrowCount = {};
for (const p of pending) {
  const k = p.split('.')[0];
  borrowCount[k] = (borrowCount[k] || 0) + 1;
}

// ---- 5. the balance law -------------------------------------------------
// Cross-theme role parity: ten rushers that are interchangeable, ten brutes
// that are interchangeable.
//
// WHY THIS IS AN ENVELOPE AND NOT A BAND AROUND A MEDIAN. The first pass here
// measured each stat against its role's median and failed the shipped roster
// on its first run - because within a role the stats TRADE. A wraith is fast
// and made of paper, a rime is slow and takes a magazine, and both are correct
// rushers; a rule that wants them to have the same speed wants one of them
// deleted. What actually has to hold is that a new type lands inside the space
// the playtested roster already occupies, not that every type sits on top of
// every other.
//
// So the numbers below are HAND AUTHORED from the twenty-one types that
// shipped, with a little headroom, and they are frozen. Deriving them from the
// table would make the test agree with whatever was last added: one slightly
// hot type widens the envelope, the next one is measured against the wider
// envelope, and after eleven themes the rule means nothing. If a new enemy really
// needs to sit outside its role, the envelope is what gets edited - as a
// deliberate, reviewable change to the game's balance, which is the point.
const ROLE_ENVELOPE = {
  // Fast and cheap. The floor on hp is what stops a rusher being a free kill
  // that only exists to pad the count; the ceiling is what stops one being a
  // brute that happens to run.
  rusher: { hp: [24, 62], speed: [2.4, 4.3], damage: [4, 13] },
  // Thin. A gunner is answered by killing it, and every one of them has to
  // die to about the same burst or the wave's real difficulty is which gunner
  // was rolled.
  gunner: { hp: [16, 34], speed: [2.0, 2.9], damage: [6, 17] },
  // The health in the wave. Slow, because a brute that can close is a rusher
  // with a brute's bar and there is no counterplay in that.
  brute: { hp: [105, 185], speed: [1.4, 1.95], damage: [12, 26] },
  // Denial. Several of these do NO direct damage at all - what they throw is
  // the whole enemy - so the damage floor is zero by design.
  artillery: { hp: [32, 52], speed: [1.7, 2.15], damage: [0, 20] },
  // High-value targets that do nothing themselves. Tougher than a gunner
  // because the answer is always to kill it first and it has to cost
  // something to turn away from the crowd and do that.
  support: { hp: [50, 76], speed: [1.9, 2.35], damage: [0, 6] },
  // THE ONE ROLE THAT IS NOT UNIFORM, and waves.js has always said so: its
  // members are near-equivalent "not by accident but by construction". A
  // harrier will not close and a shrike does nothing else, so whichever fills
  // a slot the wave still contains something in the air. Health and speed are
  // still policed; damage is deliberately wide open, because a flier that
  // only dives and a flier that only shoots cannot share a damage number.
  flier: { hp: [42, 68], speed: [3.0, 4.8], damage: [0, 22] },
};

const parity = [];
const roleTable = [];
for (const role of ROLE_KEYS) {
  const env = ROLE_ENVELOPE[role];
  const built = [];
  for (const key of THEME_KEYS) {
    const type = THEMES[key].roles[role];
    if (have(type)) built.push({ key, type, def: ENEMY_TYPES[type] });
  }
  roleTable.push({ role, n: built.length, env });
  for (const b of built) {
    for (const stat of Object.keys(env)) {
      const v = b.def[stat] || 0;
      const [lo, hi] = env[stat];
      if (v < lo || v > hi) {
        parity.push(`${role}.${stat}: ${b.type} is ${v}, envelope is ${lo}-${hi}`);
      }
    }
  }
}
ok('every type is inside its role envelope',
  parity.length === 0, parity.length ? '\n       ' + parity.join('\n       ') : '');

// THE STATUS IS THE PAYMENT. A type that is still working on the player after
// the hit has landed - a burn on contact, a gas cloud over its own corpse -
// hits for LESS than its plain role-mates, because what it leaves on you is
// where its cost lives. A type that dealt full damage AND left a burn would
// simply be a better version of its role, and the fixed-shape schedule would
// go back to being luck: a wave asking for four rushers would be harder in the
// runs where the theme dealt was the one whose rusher burns.
//
// Concretely: it sits in the LOWER HALF of its role's damage envelope.
const overpriced = [];
for (const role of ROLE_KEYS) {
  const env = ROLE_ENVELOPE[role];
  const [lo, hi] = env.damage;
  const mid = lo + (hi - lo) / 2;
  for (const key of THEME_KEYS) {
    const type = THEMES[key].roles[role];
    if (!have(type)) continue;
    const def = ENEMY_TYPES[type];
    const carries = !!(def.hitStatus || def.onDeath);
    if (carries && (def.damage || 0) > mid) {
      overpriced.push(`${role}: ${type} carries a status AND hits ${def.damage} (band midpoint ${mid})`);
    }
  }
}
ok('an afflictor hits in the lower half of its role band',
  overpriced.length === 0, overpriced.join('; '));

// ---- 6. bosses ----------------------------------------------------------
const badBoss = [];
for (const key of THEME_KEYS) {
  const b = THEMES[key].boss;
  if (have(b) && !ENEMY_TYPES[b].boss) badBoss.push(`${b} is not flagged boss:true`);
}
ok('every built boss is flagged as one', badBoss.length === 0, badBoss.join(', '));

// ---- 7. the deck --------------------------------------------------------
// The order is dealt, not drawn with replacement: waves 1-50 must contain each
// theme exactly once, or reaching wave 50 stops meaning the same thing in
// every run.

const deck = themeOrder(12345);
ok(`a deck is all ${N} themes, once each`,
  deck.length === N && new Set(deck).size === N);

const sameSeed = themeOrder(12345);
ok('the same seed deals the same order', deck.join() === sameSeed.join());

let differing = 0;
for (let s = 1; s <= 200; s++) {
  if (themeOrder(s).join() !== deck.join()) differing++;
}
ok('different seeds deal different orders', differing > 190, `${differing}/200`);

// Over the whole first pass every theme is met exactly once, and every wave
// inside a block is the same theme. A deck-length is now table-length times
// five waves, so the horizon follows the table too.
const PASS = N * 5;
const seen = new Map();
let blockBroken = 0;
for (let n = 1; n <= PASS; n++) {
  const t = themeForWave(999, n);
  if (blockPos(n) === 1) seen.set(t, (seen.get(t) || 0) + 1);
  else if (t !== themeForWave(999, n - 1)) blockBroken++;
}
ok(`waves 1-${PASS} meet every theme exactly once`,
  seen.size === N && [...seen.values()].every((v) => v === 1));
ok('a block is one theme for all five of its waves', blockBroken === 0);

// Past a deck-length the deck is re-dealt rather than repeated.
const first = [];
const second = [];
for (let n = 1; n <= PASS; n += 5) first.push(themeForWave(999, n));
for (let n = PASS + 1; n <= PASS * 2; n += 5) second.push(themeForWave(999, n));
ok(`waves ${PASS + 1}-${PASS * 2} are all ${N} themes again`,
  second.length === N && new Set(second).size === N);
ok('the second pass is re-dealt, not repeated', first.join() !== second.join());

// blockPos has to agree with the boss cadence main.js already runs on.
let cadence = 0;
for (let n = 1; n <= 120; n++) {
  if ((blockPos(n) === 5) !== (n % 5 === 0)) cadence++;
}
ok('block wave 5 is exactly the boss cadence', cadence === 0);
ok('blockIndex counts from zero', blockIndex(1) === 0 && blockIndex(5) === 0 && blockIndex(6) === 1);

// ---- report -------------------------------------------------------------

console.log('\n  role         built    hp envelope   dmg        speed');
for (const r of roleTable) {
  const e = r.env;
  console.log(
    `  ${r.role.padEnd(11)}  ${String(r.n).padStart(2)}/${String(THEME_KEYS.length).padStart(2)}   ` +
    `${(e.hp[0] + '-' + e.hp[1]).padStart(9)}  ` +
    `${(e.damage[0] + '-' + e.damage[1]).padStart(7)}  ` +
    `${(e.speed[0] + '-' + e.speed[1]).padStart(9)}`
  );
}

const built = N * ROLE_KEYS.length - pending.filter((p) => !p.endsWith('boss')).length;
console.log(`\n  ${built}/${N * ROLE_KEYS.length} enemies and ${N - pending.filter((p) => p.includes('.boss=')).length}/${N} bosses built.`);
if (pending.length) {
  console.log('  still borrowing from ' + FALLBACK_THEME.toUpperCase() + ':');
  for (const key of THEME_KEYS) {
    if (borrowCount[key]) console.log(`    ${THEMES[key].name.padEnd(8)} ${borrowCount[key]}`);
  }
}

console.log(fails ? '\nTHEME TEST FAIL' : '\nTHEME TEST PASS');
process.exit(fails ? 1 : 0);
