import { definePassiveItem } from '../shared.js';

export const id = 'deadCat';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'DEAD CAT',
    max: 1,
    theme: THEME.ninelives,
    effects: [['REVIVE ONCE AT 1 HP', GOOD], ['-40% MAX HEALTH', BAD]],
    apply: (mods, n) => {
      mods.extraLives += n;
      mods.maxHpMult *= Math.pow(0.6, n);
    },
}));
