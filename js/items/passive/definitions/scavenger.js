import { definePassiveItem } from '../shared.js';

export const id = 'scavenger';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'SCAVENGER',
    max: 3,
    theme: THEME.salvage,
    effects: (n) => [
      [step(n, (k) => '+' + 2 * k) + ' AMMO PER KILL', GOOD],
    ],
    apply: (mods, n) => {
      mods.ammoOnKill += 2 * n;
    },
}));
