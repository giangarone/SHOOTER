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

export const icon = [
  '..........4442..........',
  '...442....4332....442...',
  '..44332...4332...44332..',
  '..43332...2222...43332..',
  '..23322..........23322..',
  '...222............222...',
  '........................',
  '..12222222222222222211..',
  '...122222222222222211...',
  '....1222222222222211....',
  '.....12222222222211.....',
  '......222222222221......',
  '......122222222211......',
  '.......1222222211.......',
  '........12222211........',
  '.........122221.........',
  '..........22221.........',
  '..........22221.........',
  '..........43331.........',
  '..........43331.........',
  '..........23321.........',
  '..........22221.........',
  '..........11111.........',
  '........................',
];
