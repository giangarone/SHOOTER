import { definePassiveItem } from '../shared.js';

// ---- AMMUNITION AND MONEY ------------------------------------------------

// A FLAT HUNDRED A BODY, which is worth more early than Midas and less late -
// it does not scale with the enemy, so it pays a wave of chaff and shrugs at
// a boss. The damage is what it charges, and it charges it on every source.
export const id = 'payday';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'PAYDAY',
    max: 1,
    theme: THEME.payday,
    effects: [['+$100 PER KILL', GOOD], ['DAMAGE -10%', BAD]],
    apply: (mods, n) => {
      mods.killCredits = 100 * n;
      mods.damage *= Math.pow(0.9, n);
    },
}));
