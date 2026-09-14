import { definePassiveItem } from '../shared.js';

// ---- staying alive ------------------------------------------------------

// ARMOUR THAT ONLY EXISTS WHERE IT MATTERS. BERSERKER pays damage for a low
// bar and this pays survival for it, and the two are meant to be found
// together: the quarter of the bar that used to be the part a run died in is
// the part it now fights hardest in.
//
// A HARD LINE AND NOT A RAMP, unlike BERSERKER - it is a place on the bar the
// player can see themselves crossing, and a ramp would make the best moment
// of the pick invisible.
export const id = 'coldBlood';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'COLD BLOOD',
    max: 1,
    theme: THEME.coldBlood,
    effects: [['TAKE 30% LESS DAMAGE', GOOD], ['BELOW 25% HEALTH', NOTE]],
    apply: (mods, n) => { mods.coldBloodAt = 0.25; mods.coldBloodCut = 0.3 * n; },
}));
