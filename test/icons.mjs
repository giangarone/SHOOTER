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
import { UPGRADES, RARITY } from '../js/upgrades.js';
import { ACTIVE_ITEMS } from '../js/items.js';
import { WEAPONS } from '../js/weapons.js';
import { POWERUP_TYPES, AMMO_PICKUP } from '../js/powerups.js';
import { PLAYER_STATUS } from '../js/status.js';
import { PIXEL_ICON_KEYS, resolveIcon, GRID } from '../js/pixelicons.js';

// Icons used by things that are not upgrades. Stations and weapons name their
// icon explicitly - they have no upgrade id to key off - so they are the only
// entries that can drift.
// The two REROLL consoles - one beside the totems, one beside the active item
// pedestal - deliberately share the arrows and are listed once. One shape means
// one thing is the rule; these two do the same thing in two rows, and teaching
// a second symbol for it would break the rule rather than keep it.
const STATION_ICONS = {
  AMMO_STATION: 'ammoBox',
  REROLL_STATIONS: 'gear',
  MAXHP_STATION: 'heart',
};

// The pickups. Unlike an upgrade, a pickup names its drawing explicitly
// (`icon` on its entry in powerups.js), so these can drift the same way the
// stations can - and a pickup with no drawing is a crash the first time an
// enemy dies, which is the worst place in the game to find one.

let fails = 0;
const ok = (name, cond, extra = '') => {
  console.log((cond ? 'ok   ' : 'FAIL ') + name + (extra ? '  ' + extra : ''));
  if (!cond) fails++;
};

const drawn = new Set(PIXEL_ICON_KEYS);
const users = {};
for (const id of Object.keys(UPGRADES)) users[id] = UPGRADES[id].name;
for (const [name, icon] of Object.entries(STATION_ICONS)) users[icon] = name;
for (const [key, def] of Object.entries(POWERUP_TYPES)) users[def.icon] = 'PICKUP ' + key;
users[AMMO_PICKUP.icon] = 'PICKUP ammo';
// The player's status effects. Like a pickup, each names its drawing on its
// own entry, so the same drift is possible and the same crash - buildPixelIcon
// throws - waits at the other end of it.
for (const [key, def] of Object.entries(PLAYER_STATUS)) users[def.icon] = 'STATUS ' + key;
for (const w of Object.values(WEAPONS)) if (w.icon) users[w.icon] = 'WEAPON ' + w.name;
// The active items. Keyed by id exactly the way the upgrades are, so the same
// two failures apply: an item with no drawing crashes the first pedestal that
// offers it, and a drawing nothing uses is art left behind by a rename.
for (const key of Object.keys(ACTIVE_ITEMS)) users[key] = 'ITEM ' + ACTIVE_ITEMS[key].name;

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

// THE POOL AFTER THE MERGE. Eleven mutations came in from the Devil's row when
// it was retired, and the two fields that made them his - `devil` and `cost` -
// had to come off every one of them or rollTotems() would go on skipping them:
// a mutation that is in the map, has a drawing, passes every check above and
// can never actually be offered is the one failure nothing else here would see.
const stray = Object.keys(UPGRADES).filter((k) => UPGRADES[k].devil || UPGRADES[k].cost);
ok('no upgrade is still a Devil Deal', stray.length === 0, stray.join(', '));

const badRarity = Object.keys(UPGRADES).filter((k) => !RARITY[UPGRADES[k].rarity]);
ok('every upgrade has a real rarity', badRarity.length === 0, badRarity.join(', '));

// An item with no `use` is a button that does nothing, which the game has no
// way to notice: tryItem() would spend the charge and call undefined.
const badItems = Object.keys(ACTIVE_ITEMS).filter(
  (k) => typeof ACTIVE_ITEMS[k].use !== 'function' || !(ACTIVE_ITEMS[k].cooldown > 0)
);
ok('every active item has a use and a cooldown', badItems.length === 0, badItems.join(', '));

console.log(
  `\n${Object.keys(users).length} offers (${Object.keys(UPGRADES).length} upgrades + ` +
  `${Object.keys(STATION_ICONS).length} stations + ` +
  `${Object.keys(POWERUP_TYPES).length + 1} pickups + ` +
  `${Object.keys(PLAYER_STATUS).length} statuses + ` +
  `${Object.values(WEAPONS).filter((w) => w.icon).length} weapons + ` +
  `${Object.keys(ACTIVE_ITEMS).length} items) ` +
  `over ${PIXEL_ICON_KEYS.length} drawings`
);
console.log(fails ? 'ICON TEST FAIL' : 'ICON TEST PASS');
process.exit(fails ? 1 : 0);
