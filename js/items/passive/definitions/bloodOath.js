import { definePassiveItem } from '../shared.js';

// DOUBLE DAMAGE, PAID FOR IN BAR, FOREVER. Five max HP a wave is nothing on
// wave two and the whole run by wave twenty - and it stops at fifty, which is
// the number that keeps it a build rather than a countdown. Anything that
// raises the cap back over fifty starts the meter again, which is the honest
// reading of the deal: the oath is on the max, not on a wave count.
export const id = 'bloodOath';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'BLOOD OATH',
    max: 1,
    theme: THEME.bloodOath,
    effects: [['+100% DAMAGE', GOOD], ['-5 MAX HP PER WAVE', BAD], ['FLOORS AT 50 MAX HP', NOTE]],
    apply: (mods, n) => { mods.oathPerWave = 5 * n; mods.oathFloor = 50; },
}));
