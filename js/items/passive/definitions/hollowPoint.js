import { definePassiveItem } from '../shared.js';

export const id = 'hollowPoint';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'HOLLOW POINT',
    max: 3,
    theme: THEME.damage,
    effects: (n) => [
      ['DAMAGE ' + step(n, pctUp(30)), GOOD],
      ['MAGAZINE ' + step(n, pctDown(0.75)), BAD],
    ],
    apply: (mods, n) => {
      mods.damage *= 1 + 0.3 * n;
      mods.magMult *= Math.pow(0.75, n);
    },
}));
