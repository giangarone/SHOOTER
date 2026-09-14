import { definePassiveItem } from '../shared.js';

export const id = 'vampiric';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'VAMPIRIC ROUNDS',
    max: 3,
    theme: THEME.blood,
    effects: (n) => [
      ['HEAL 1 HP ON KILL,', GOOD],
      ['CHANCE ' + step(n, (k) => 25 * (k + 1) + '%'), NOTE],
    ],
    // Chance per kill, one stack at a time: 50%, then 75%, then every kill.
    apply: (mods, n) => { mods.killHealChance = 0.25 * (n + 1); },
}));
