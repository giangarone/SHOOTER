import { definePassiveItem } from '../shared.js';

export const id = 'ammoFab';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'AMMO FABRICATOR',
    max: 3,
    theme: THEME.fabricate,
    // Combat only, like Nanoweave: the wave break has no clock on it, and a
    // trickle that ran there was an infinite ammo box you reached by waiting.
    effects: (n) => [
      ['AMMO / SEC ' + step(n, (k) => '+' + 2.5 * k), GOOD],
      ['IN COMBAT ONLY', NOTE],
    ],
    apply: (mods, n) => { mods.ammoRegen += 2.5 * n; },
}));
