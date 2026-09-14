import { definePassiveItem } from '../shared.js';

export const id = 'gravityRounds';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'GRAVITY ROUNDS',
    max: 1,
    theme: THEME.gravity,
    effects: [['HITS PULL ENEMIES', GOOD], ['1.5m TOWARD YOU', NOTE]],
    apply: (mods, n) => {
      mods.gravityPull = 1.5 * n;
      mods.gravityRadius = 5;
    },
}));
