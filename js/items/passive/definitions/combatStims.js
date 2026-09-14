import { definePassiveItem } from '../shared.js';

export const id = 'combatStims';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'COMBAT STIMS',
    max: 2,
    theme: THEME.mobility,
    effects: (n) => [['MOVE SPEED ' + step(n, pctUp(30)), GOOD]],
    apply: (mods, n) => { mods.moveMult *= 1 + 0.30 * n; },
}));
