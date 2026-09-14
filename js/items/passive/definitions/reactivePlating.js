import { definePassiveItem } from '../shared.js';

export const id = 'reactivePlating';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'REACTIVE PLATING',
    max: 3,
    theme: THEME.shock,
    effects: (n) => [
      ['SHOCKWAVE WHEN HIT', GOOD],
      ['DAMAGE ' + step(n, (k) => String(45 * k)), NOTE],
      ['RADIUS ' + step(n, (k) => 5 + k + 'm'), NOTE],
    ],
    apply: (mods, n) => {
      mods.shockwave += 45 * n;
      mods.shockwaveRadius = 5 + n;
    },
}));
