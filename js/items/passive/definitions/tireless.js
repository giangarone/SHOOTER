import { definePassiveItem } from '../shared.js';

// THE BAR NEVER EMPTIES. Second Wind buys the rhythm back faster; this
// deletes the rhythm, so sprinting and sliding stop being resources and
// become the way the player moves.
export const id = 'tireless';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'TIRELESS',
    max: 1,
    theme: THEME.tireless,
    effects: [['UNLIMITED STAMINA', GOOD]],
    apply: (mods, n) => { mods.staminaDrain *= Math.pow(0, n); },
}));
