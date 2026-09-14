import { definePassiveItem } from '../shared.js';

// ---- money, and what it buys that is not in the shop --------------------

// CREDITS THAT EARN. The only pick in the pool that pays for NOT spending,
// and it is deliberately paid at the wave END rather than per second: a rate
// would make standing in the shop the best move in the game, and the wave
// boundary is a thing the player cannot farm - it arrives when the room is
// empty and not before.
//
// IT COMPOUNDS, as the word means: the interest is paid into the balance the
// next wave's interest is measured against.
export const id = 'highInterest';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'HIGH INTEREST',
    max: 1,
    theme: THEME.highInterest,
    effects: [['UNSPENT CREDITS EARN', NOTE], ['20% INTEREST', GOOD], ['AT EVERY WAVE END', NOTE]],
    apply: (mods, n) => { mods.interest = 0.2 * n; },
}));
