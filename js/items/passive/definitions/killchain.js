import { definePassiveItem } from '../shared.js';

export const id = 'killchain';

export default definePassiveItem(({ GOOD, BAD, NOTE }) => ({
    name: "KILLCHAIN",
    max: 1,
    theme: 0xf03f7b,
    effects: [['ON KILL: +1s INVINCIBLE', GOOD], ['STACKS UP TO 5s', NOTE]],
    apply: (mods, n) => { mods.killchain = n; },
}));

// THE CHAIN INTO THE SHIELD. Five ring links running down into a starred
// guard, with the five seconds they bank piped along the bottom - a kill,
// a second, a longer life.
export const icon = [
  '........................',
  '........................',
  '........................',
  '..333...................',
  '..303...................',
  '..333333................',
  '.....303................',
  '.....333333.............',
  '........303.............',
  '........333333..........',
  '...........303..........',
  '...........333333.......',
  '..............303.......',
  '..............333.......',
  '................433331..',
  '................424221..',
  '................234321..',
  '................223321..',
  '.................2331...',
  '..................31....',
  '........................',
  '....4..3..3..3..3.......',
  '........................',
  '........................',
];

