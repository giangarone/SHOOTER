import { definePassiveItem } from '../shared.js';

export const id = 'petrify';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'PETRIFY',
    max: 1,
    theme: THEME.stone,
    effects: [['HITS: 12% CHANCE TO', GOOD], ['FREEZE FOR 1.5s', NOTE], ['FROZEN TAKE +50% DMG', GOOD]],
    apply: (mods, n) => {
      mods.petrifyChance = 0.12 * n;
      mods.petrifyTime = 1.5 * n;
    },
}));
