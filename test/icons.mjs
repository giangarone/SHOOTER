// Every mutation gets its own icon, and every icon it names actually exists.
//
// Pure data check - no browser, no renderer, so it runs in milliseconds and
// can be the thing that fails first. Two failure modes, and the second is the
// dangerous one:
//
//   1. Two upgrades naming the SAME icon. Visible, but only if you happen to
//      meet both on one totem row.
//   2. An upgrade naming an icon that DOES NOT EXIST. buildIcon() falls back
//      to `shard` for an unknown key, silently and without an error, so a
//      typo puts two upgrades back on one shape and looks like a design
//      choice rather than a bug.
import { UPGRADES } from '../js/upgrades.js';
import { ICON_KEYS } from '../js/icons.js';
import { WEAPONS } from '../js/weapons.js';

// Icons used by things that are not upgrades. They share the catalogue, so
// they have to be counted when checking for collisions - the ammo and reroll
// consoles stand in the same row as the totems.
const STATION_ICONS = { AMMO_STATION: 'ammoBox', REROLL_STATION: 'gear' };

let fails = 0;
const ok = (name, cond, extra = '') => {
  console.log((cond ? 'ok   ' : 'FAIL ') + name + (extra ? '  ' + extra : ''));
  if (!cond) fails++;
};

const known = new Set(ICON_KEYS);
const users = {};
for (const [id, def] of Object.entries(UPGRADES)) users[def.name] = def.icon;
for (const [name, icon] of Object.entries(STATION_ICONS)) users[name] = icon;
for (const w of Object.values(WEAPONS)) if (w.icon) users['WEAPON ' + w.name] = w.icon;

const unnamed = Object.entries(users).filter(([, i]) => !i).map(([n]) => n);
ok('every offer names an icon', unnamed.length === 0, unnamed.join(', '));

const unknown = Object.entries(users).filter(([, i]) => i && !known.has(i));
ok(
  'every named icon exists in icons.js',
  unknown.length === 0,
  unknown.map(([n, i]) => n + ' -> ' + i).join(', ')
);

const by = {};
for (const [name, icon] of Object.entries(users)) (by[icon] ||= []).push(name);
const dupes = Object.entries(by).filter(([, v]) => v.length > 1);
ok(
  'no two offers share an icon',
  dupes.length === 0,
  dupes.map(([i, v]) => i + ': ' + v.join(' + ')).join(' | ')
);

// `shard` is the fallback buildIcon() returns for an unknown key. Nothing
// should be USING it as its declared icon, or a genuine fallback becomes
// indistinguishable from a deliberate choice.
ok('nothing claims the fallback icon', !by.shard, (by.shard || []).join(', '));

const count = Object.keys(users).length;
console.log(
  `\n${count} offers (${Object.keys(UPGRADES).length} upgrades + ` +
  `${Object.keys(STATION_ICONS).length} stations + ` +
  `${Object.values(WEAPONS).filter((w) => w.icon).length} weapons) ` +
  `over ${ICON_KEYS.length} shapes`
);
console.log(fails ? 'ICON TEST FAIL' : 'ICON TEST PASS');
process.exit(fails ? 1 : 0);
