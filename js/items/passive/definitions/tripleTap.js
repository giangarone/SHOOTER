import { definePassiveItem } from '../shared.js';

export const id = 'tripleTap';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'TRIPLE TAP',
    max: 1,
    theme: THEME.burden,
    effects: [['+70% DAMAGE', GOOD], ['3 AMMO PER SHOT', BAD]],
    apply: (mods, n) => {
      mods.damage *= 1 + 0.7 * n;
      mods.ammoPerShot = 1 + 2 * n;
    },
}));
