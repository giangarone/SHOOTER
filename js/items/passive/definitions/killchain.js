import { definePassiveItem } from '../shared.js';

export const id = 'killchain';

export default definePassiveItem(({ GOOD, BAD, NOTE }) => ({
    name: "KILLCHAIN",
    max: 1,
    theme: 0xf03f7b,
    effects: [['ON KILL: +0.2s INVINCIBLE', GOOD], ['STACKS UP TO 1s', NOTE]],
    apply: (mods, n) => { mods.killchain = 0.2 * n; },
}));

// THE CHAIN INTO THE SHIELD. Five ring links running down into a starred
// guard, with the one second they bank piped along the bottom - a kill,
// a fraction, a longer life.
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

