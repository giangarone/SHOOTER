import { definePassiveItem } from '../shared.js';

// THE WALLET AS ARMOUR. Capped at 20% and it takes $10,000 to get there,
// which is a shop's worth of savings deliberately not spent - so the pick is
// a reason to walk past the box, and it is at its weakest on the wave after
// one is bought. That swing is the whole of it.
export const id = 'moneyBelt';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'MONEY BELT',
    max: 1,
    theme: THEME.moneyBelt,
    effects: [['TAKE 1% LESS DAMAGE', GOOD], ['PER $500 HELD', NOTE], ['UP TO 20% LESS', NOTE]],
    apply: (mods, n) => { mods.beltStep = 0.01 * n; mods.beltPer = 500; mods.beltCap = 0.2 * n; },
}));
