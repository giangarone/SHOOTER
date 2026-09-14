import { definePassiveItem } from '../shared.js';

export const id = 'speedLoader';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'SPEED LOADER',
    max: 3,
    theme: THEME.brass,
    effects: (n) => [['RELOAD ' + step(n, pctDown(0.7)), GOOD]],
    apply: (mods, n) => { mods.reloadMult *= Math.pow(0.7, n); },
}));
