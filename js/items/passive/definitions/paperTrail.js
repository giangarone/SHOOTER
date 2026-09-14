import { definePassiveItem } from '../shared.js';

// WAR CHEST'S OPPOSITE NUMBER. That pick pays for the money sitting in the
// wallet and this pays for the money that has left it, so the two are the
// two halves of an economy build and neither is worth much to a run that
// does neither.
//
// PERMANENT AND UNCAPPED, because the thing it counts already is: a run
// cannot un-spend money. A wave-40 run has bought perhaps a dozen boxes and
// as many rerolls at a doubling price, which is +40% or so - real, and
// nothing like the runaway CARNAGE is.
export const id = 'paperTrail';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'PAPER TRAIL',
    max: 1,
    theme: THEME.paperTrail,
    effects: [['+1% DAMAGE PER $1,000', GOOD], ['EVERY SPENT, FOREVER', NOTE]],
    apply: (mods, n) => { mods.paperTrail = 0.01 * n; },
}));
