import { definePassiveItem } from '../shared.js';

export const id = 'darkPower';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'DARK POWER',
    max: 1,
    theme: THEME.power,
    // The plainest entry in the pool: damage, no drawback, no condition. It
    // cost five max HP on the old paid row, and free it is still UNDER Hollow
    // Point - a common, at +30% a stack for a smaller magazine - so it needs
    // no rebalance to sit here. Not everything has to be a decision.
    effects: [['+20% DAMAGE', GOOD]],
    apply: (mods, n) => { mods.damage *= 1 + 0.2 * n; },
}));
