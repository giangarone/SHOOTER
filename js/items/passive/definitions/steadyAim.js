import { definePassiveItem } from '../shared.js';

export const id = 'steadyAim';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'STEADY AIM',
    max: 2,
    theme: THEME.poise,
    effects: (n) => [
      ['DAMAGE ' + step(n, pctUp(40)), GOOD],
      ['WHILE STANDING STILL', NOTE],
    ],
    apply: (mods, n) => { mods.steady += 0.4 * n; },
}));
