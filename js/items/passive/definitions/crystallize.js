import { definePassiveItem } from '../shared.js';

export const id = 'crystallize';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'CRYSTALLIZE',
    max: 1,
    theme: THEME.ice,
    effects: [['FROZEN ENEMIES SHATTER', GOOD], ['ON DEATH: 60 DMG IN 3.5m', NOTE]],
    apply: (mods, n) => {
      mods.shatterDamage = 60 * n;
      mods.shatterRadius = 3.5;
    },
}));
