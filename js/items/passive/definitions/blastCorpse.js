import { definePassiveItem } from '../shared.js';

export const id = 'blastCorpse';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'BLAST CORPSE',
    max: 1,
    theme: THEME.ember,
    effects: [['DEAD ENEMIES EXPLODE', GOOD], ['45 DMG IN 4m', NOTE], ['CAN HIT YOU TOO', BAD]],
    apply: (mods, n) => {
      mods.corpseDamage = 45 * n;
      mods.corpseRadius = 4;
    },
}));
