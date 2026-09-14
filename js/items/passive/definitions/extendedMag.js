import { definePassiveItem } from '../shared.js';

export const id = 'extendedMag';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'EXTENDED MAG',
    max: 3,
    theme: THEME.ammo,
    effects: (n) => [['MAGAZINE ' + step(n, pctUp(50)), GOOD]],
    apply: (mods, n) => { mods.magMult *= 1 + 0.5 * n; },
}));
