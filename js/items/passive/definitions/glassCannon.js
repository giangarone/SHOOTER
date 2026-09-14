import { definePassiveItem } from '../shared.js';

export const id = 'glassCannon';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'GLASS CANNON',
    max: 1,
    theme: THEME.glass,
    effects: [['+70% DAMAGE', GOOD], ['-50% MAX HEALTH', BAD]],
    apply: (mods, n) => {
      mods.damage *= 1 + 0.7 * n;
      mods.maxHpMult *= Math.pow(0.5, n);
    },
}));
