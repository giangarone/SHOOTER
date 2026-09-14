import { definePassiveItem } from '../shared.js';

export const id = 'neurotoxin';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'NEUROTOXIN',
    max: 1,
    theme: THEME.poison,
    // Slowing a poisoned enemy would have been Cryo Rounds with a different
    // name - Cryo already halves their speed and their shots. Spreading is the
    // thing only poison does.
    effects: [['POISON SPREADS BETWEEN', GOOD], ['ENEMIES WITHIN 3m', NOTE]],
    apply: (mods, n) => { mods.poisonSpread = 3 * n; },
}));
