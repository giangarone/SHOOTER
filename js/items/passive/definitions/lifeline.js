import { definePassiveItem } from '../shared.js';

// A FLOOR UNDER THE BAR. It regenerates only up to 25 and then stops, so it
// is not a heal - it is a promise that the bottom of the bar refills itself,
// fast, and that the player can spend it. Nothing else in the pool makes
// being nearly dead a place you can stay.
export const id = 'lifeline';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'LIFELINE',
    max: 1,
    theme: THEME.lifeline,
    effects: [['AT 25 HP OR BELOW:', NOTE], ['REGEN 5 HP/s', GOOD]],

    apply: (mods, n) => { mods.lifelineAt = 25; mods.lifelineRate = 5 * n; },
}));
