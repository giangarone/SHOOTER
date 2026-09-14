import { definePassiveItem } from '../shared.js';

// THREE FREE MISTAKES A WAVE, not one. At one it was a pick that mattered for
// the first contact of a wave and then sat dead for the ninety seconds that
// decided the run - a passive item the player stopped owning the moment it
// paid out. Three is a real allowance: it survives an opening the player
// misread, and it still runs out inside a wave that is going badly, which is
// the only reason it is worth taking rather than counting on.
//
// THEY DO NOT BANK. armWard SETS the count at every wave start, so a clean
// wave hands the next one three and not six - see Player.armWard.
export const id = 'holyMantle';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'HOLY MANTLE',
    max: 1,
    theme: THEME.holy,
    effects: [['FIRST 3 HITS EACH WAVE', GOOD], ['DEAL NO DAMAGE', NOTE]],
    apply: (mods, n) => { mods.wardPerWave = 3 * n; },
}));
