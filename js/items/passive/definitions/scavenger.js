import { definePassiveItem } from '../shared.js';

export const id = 'scavenger';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'SCAVENGER',
    max: 3,
    theme: THEME.salvage,
    effects: (n) => [
      ['+2 AMMO PER KILL', GOOD],
      ['FROM ' + step(n, (k) => '+' + 2 * k), NOTE],
    ],
    apply: (mods, n) => {
      mods.ammoOnKill += 2 * n;
    },
}));
