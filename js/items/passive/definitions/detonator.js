import { definePassiveItem } from '../shared.js';

export const id = 'detonator';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'DETONATOR',
    max: 1,
    theme: THEME.blast,
    effects: [['HITS EXPLODE', GOOD], ['30 DMG IN 2.5m', NOTE], ['FIRE RATE -25%', BAD]],
    apply: (mods, n) => {
      mods.blastDamage = 30 * n;
      mods.blastRadius = 2.5;
      mods.fireRate *= Math.pow(0.75, n);
    },
}));
