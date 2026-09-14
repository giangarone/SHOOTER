import { definePassiveItem } from '../shared.js';

export const id = 'arcRounds';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'ARC ROUNDS',
    max: 1,
    theme: THEME.electric,
    effects: [['HITS ARC TO 1 MORE', GOOD], ['ENEMY FOR 40% DMG', NOTE]],
    apply: (mods, n) => {
      mods.chainDamage = 0.4 * n;
      mods.chainRange = 6;
    },
}));
