import { definePassiveItem } from '../shared.js';

// LODESTONE'S ENDGAME, AT HALF PRICE. The wave-clear sweep never switches
// off, so money is something that happens rather than something you walk to -
// and every orb is worth half, so the pick is about ATTENTION and not income.
export const id = 'autoLoot';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'AUTO-LOOT',
    max: 1,
    theme: 0xb59a3f,
    effects: [['ALL CREDITS FLY TO YOU', GOOD], ['EACH WORTH HALF', BAD]],
    apply: (mods, n) => {
      mods.autoLoot = n;
      mods.creditMult *= Math.pow(0.5, n);
    },
}));

export const icon = [
  '........................',
  '........................',
  '.......222....222.......',
  '......2442....2442......',
  '......2222....2222......',
  '......2222....2222......',
  '.......2222..2222.......',
  '........22222222........',
  '.........33..33.........',
  '.........44..44.........',
  '........24442244........',
  '.........24422442.......',
  '..........244442........',
  '...........2442.........',
  '...........2402.........',
  '............33..........',
  '............3...........',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
];
