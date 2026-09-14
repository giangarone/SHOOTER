import { definePassiveItem } from '../shared.js';

export const id = 'overclock';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'OVERCLOCK',
    max: 5,
    theme: THEME.rate,
    effects: (n) => [['FIRE RATE ' + step(n, pctUp(20)), GOOD]],
    apply: (mods, n) => { mods.fireRate *= 1 + 0.2 * n; },
}));
