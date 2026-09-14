import { definePassiveItem } from '../shared.js';

// ---- DAMAGE -------------------------------------------------------------

// TEN TIMES, ONCE A MAGAZINE. It is the reload rhythm turned into a weapon:
// Breach Round and Hellfire both pay the player for reloading, and this pays
// them for reloading EARLY, which is the one thing those two do not ask for.
export const id = 'cannonade';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'CANNONADE',
    max: 1,
    theme: THEME.cannonade,
    effects: [['FIRST SHOT OF EACH', NOTE], ['MAGAZINE: 10x DAMAGE', GOOD]],
    apply: (mods, n) => { mods.firstShot = 10 * n; },
}));
