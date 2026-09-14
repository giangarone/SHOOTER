import { definePassiveItem } from '../shared.js';

// THE GUN NEVER STOPS, IT ONLY GETS EXPENSIVE. Ten dollars a round is real
// money on wave three and pocket change on wave thirty, which is the correct
// shape: it is an emergency early and a way of playing late.
export const id = 'cashCannon';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'CASH CANNON',
    max: 1,
    theme: THEME.cashCannon,
    effects: [['OUT OF AMMO?', NOTE], ['KEEP SHOOTING: $10/SHOT', GOOD]],
    apply: (mods, n) => { mods.cashCannon = 10 * n; },
}));
