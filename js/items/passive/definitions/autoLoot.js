import { definePassiveItem } from '../shared.js';

// LODESTONE'S ENDGAME, AT HALF PRICE. The wave-clear sweep never switches
// off, so money is something that happens rather than something you walk to -
// and every orb is worth half, so the pick is about ATTENTION and not income.
export const id = 'autoLoot';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'AUTO-LOOT',
    max: 1,
    theme: THEME.autoLoot,
    effects: [['ALL CREDITS FLY TO YOU', GOOD], ['EACH WORTH HALF', BAD]],
    apply: (mods, n) => {
      mods.autoLoot = n;
      mods.creditMult *= Math.pow(0.5, n);
    },
}));
