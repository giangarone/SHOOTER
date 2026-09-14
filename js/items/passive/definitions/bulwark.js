import { definePassiveItem } from '../shared.js';

export const id = 'bulwark';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'BULWARK',
    max: 3,
    theme: THEME.armor,
    effects: (n) => [
      ['MAX HEALTH ' + step(n, (k) => '+' + 50 * k), GOOD],
      ['MOVE SPEED ' + step(n, pctDown(0.88)), BAD],
    ],
    apply: (mods, n) => {
      mods.maxHpBonus += 50 * n;
      mods.moveMult *= Math.pow(0.88, n);
    },
}));
