import { definePassiveItem } from '../shared.js';

export const id = 'midas';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'MIDAS TOUCH',
    max: 1,
    theme: THEME.gold,
    effects: [['KILLS DROP 2x CREDITS', GOOD], ['THE FLOOR TURNS GOLD', NOTE]],
    apply: (mods, n) => {
      mods.creditMult *= 1 + n;
      mods.midas = 1;
    },
}));
