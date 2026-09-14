import { definePassiveItem } from '../shared.js';

// THE SHOP, GAMBLED WITH. Nine visits in ten it is the best economy pick in
// the game - every reroll and every box roll free, price ladder and all - and
// the tenth is the worst thing that can happen to a run that is winning.
//
// The price check goes with the price: a player carrying this can always
// pull the lever, which is what makes the tenth pull a real risk rather than
// a discount they were saving up for anyway.
export const id = 'highStakes';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'HIGH STAKES',
    max: 1,
    theme: THEME.highStakes,
    effects: [['REROLLS & BOX ROLLS', GOOD], ['ARE FREE', GOOD], ['10%: DROPPED TO 1 HP', BAD], ['AND 1 AMMO', BAD]],
    apply: (mods, n) => { mods.highStakes = n; mods.stakesOdds = 0.1; },
}));
