import { definePassiveItem } from '../shared.js';

// A FULL MAGAZINE FOR A HIT. It is the only pick in the pool that turns
// taking damage into ammunition, and the rounds are made rather than moved -
// the reserve is never touched - so it is worth most to exactly the build
// that is running out of both at once.
export const id = 'bruiseRounds';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'BRUISE ROUNDS',
    max: 1,
    theme: THEME.bruiseRounds,
    effects: [['TAKING A HIT REFILLS', GOOD], ['YOUR MAGAZINE', NOTE]],
    apply: (mods, n) => { mods.bruise = n; },
}));
