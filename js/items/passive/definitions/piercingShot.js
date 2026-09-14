import { definePassiveItem } from '../shared.js';

export const id = 'piercingShot';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'PIERCING SHOT',
    max: 3,
    theme: THEME.pierce,
    effects: (n) => [
      ['SHOTS PIERCE ' + step(n, (k) => String(k)), GOOD],
      ['ENEMIES EACH', NOTE],
      ['-30% DMG PER PIERCE', BAD],
    ],
    apply: (mods, n) => {
      mods.pierce = n;
      mods.pierceFalloff = 0.7;
    },
}));
