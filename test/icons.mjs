// Every offer has a drawing, every drawing has an offer, and every drawing is
// a well-formed 24x24.
//
// The old 3D catalogue needed this test to police "one shape per offer": icons
// were named by a separate `icon:` field, so two upgrades could quietly point
// at the same shape, and a typo fell back to a generic shard without an error.
// Neither is possible now - the catalogue is keyed by upgrade id, so a
// collision cannot be expressed and a typo is a missing key rather than a
// silent substitution - which leaves three things worth checking:
//
//   1. An upgrade with NO drawing. buildPixelIcon() throws on an unknown key,
//      so this is a crash the first time that upgrade is rolled, in a run the
//      player has already spent twenty minutes on.
//   2. A drawing nothing uses. Harmless at runtime, but it means an upgrade
//      was renamed or removed and its art was left behind - so the next person
//      to look at the catalogue is reading a shape for something that is gone.
//   3. A malformed map. The rows are generated, but they are generated into a
//      hand-editable file, and resolveIcon() pads and truncates silently.
//
// Pure data - no browser, no renderer - so it runs in milliseconds and can be
// the thing that fails first.
import { UPGRADES } from '../js/upgrades.js';
import { WEAPONS } from '../js/weapons.js';
import { PIXEL_ICON_KEYS, resolveIcon, GRID } from '../js/pixelicons.js';

// Icons used by things that are not upgrades. Stations and weapons name their
// icon explicitly - they have no upgrade id to key off - so they are the only
// entries that can drift.
// The two REROLL consoles - one beside the totems, one beside the Devil's
// deals - deliberately share the arrows and are listed once. One shape means
// one thing is the rule; these two do the same thing in two rows, and teaching
// a second symbol for it would break the rule rather than keep it.
const STATION_ICONS = {
  AMMO_STATION: 'ammoBox',
  REROLL_STATIONS: 'gear',
  MAXHP_STATION: 'heart',
};

let fails = 0;
const ok = (name, cond, extra = '') => {
  console.log((cond ? 'ok   ' : 'FAIL ') + name + (extra ? '  ' + extra : ''));
  if (!cond) fails++;
};

const drawn = new Set(PIXEL_ICON_KEYS);
const users = {};
for (const id of Object.keys(UPGRADES)) users[id] = UPGRADES[id].name;
for (const [name, icon] of Object.entries(STATION_ICONS)) users[icon] = name;
for (const w of Object.values(WEAPONS)) if (w.icon) users[w.icon] = 'WEAPON ' + w.name;

const missing = Object.entries(users).filter(([k]) => !drawn.has(k));
ok(
  'every offer has a drawing',
  missing.length === 0,
  missing.map(([k, n]) => n + ' -> ' + k).join(', ')
);

const orphans = [...drawn].filter((k) => !users[k]);
ok('no drawing is left over', orphans.length === 0, orphans.join(', '));

// resolveIcon() pads short rows and truncates long ones without complaining,
// which would turn a mangled map into a subtly wrong icon rather than an error.
const TONES = new Set(['.', '0', '1', '2', '3', '4']);
const malformed = [];
for (const k of drawn) {
  const rows = resolveIcon(k);
  if (rows.length !== GRID) malformed.push(k + ': ' + rows.length + ' rows');
  else if (rows.some((r) => r.length !== GRID)) malformed.push(k + ': short row');
  else if (rows.some((r) => r.some((t) => !TONES.has(t)))) malformed.push(k + ': bad tone');
}
ok('every drawing is a well-formed 24x24', malformed.length === 0, malformed.join(', '));

// Nothing may be blank. An icon with no pixels raycasts, orbits and pulses
// like any other - it is simply invisible, on a totem the player is expected
// to read from across the arena.
const empty = [...drawn].filter(
  (k) => !resolveIcon(k).some((r) => r.some((t) => t !== '.' && t !== '0'))
);
ok('no drawing is blank', empty.length === 0, empty.join(', '));

console.log(
  `\n${Object.keys(users).length} offers (${Object.keys(UPGRADES).length} upgrades + ` +
  `${Object.keys(STATION_ICONS).length} stations + ` +
  `${Object.values(WEAPONS).filter((w) => w.icon).length} weapons) ` +
  `over ${PIXEL_ICON_KEYS.length} drawings`
);
console.log(fails ? 'ICON TEST FAIL' : 'ICON TEST PASS');
process.exit(fails ? 1 : 0);
