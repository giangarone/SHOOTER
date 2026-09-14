import { definePassiveItem } from '../shared.js';

export const id = 'evasion';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'EVASION',
    max: 3,
    theme: THEME.evade,
    effects: (n) => [
      ['DODGE ' + step(n, pctUp(12)), GOOD],
      ['OF HITS TAKEN', NOTE],
      ['+40% SPEED ON DODGE', GOOD],
    ],
    apply: (mods, n) => { mods.dodgeChance = 0.12 * n; },
}));
