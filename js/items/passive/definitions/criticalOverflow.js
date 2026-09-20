import { definePassiveItem } from '../shared.js';

// CRITS THAT PAY FOR THEMSELVES, and ordinary rounds that pay for the crits.
// At the base 5% chance this is a straight ammunition tax; every crit pick in
// the pool above turns it the other way up, which is what makes it a pick for
// a build rather than a pick on its own.
export const id = 'criticalOverflow';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'CRITICAL OVERFLOW',
    max: 1,
    theme: THEME.criticalOverflow,
    effects: [['CRITS: +50% DMG', GOOD], ['AND REFUND 1 AMMO', GOOD], ['NON-CRITS COST +1 AMMO', BAD]],
    apply: (mods, n) => {
      mods.critMult *= 1 + 0.5 * n;
      mods.critOverflow = n;
    },
}));
