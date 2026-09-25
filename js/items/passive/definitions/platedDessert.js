import { definePassiveItem } from '../shared.js';

// THE CRATE AT FULL HEALTH, WORTH SOMETHING. Health plates are withheld at a
// full bar precisely because they would be a drop that cannot be spent (see
// rollDrop); PLASMA BAG answered that with shield and this answers it with
// the frame itself. Five max HP is the smaller number of the two on purpose -
// a crate is walked over several times a wave and the bar it grows compounds
// over a run - and it still heals normally under the cap.
//
// THE BANK IS ITS OWN, for GRISTLE's reason: that pick rides `crateHp` and
// one shared ceiling would let either eat the other's.
export const id = 'platedDessert';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'PLATED DESSERT',
    max: 1,
    theme: 0xe6b03a,
    effects: [['FULL-HP CRATES GIVE', GOOD], ['+5 MAX HP INSTEAD', NOTE]],
    apply: (mods, n) => { mods.platedDessert = 5 * n; },
}));

// A CAKE UNDER A CLOCHE, SEATED ON ITS PLATE. The dome now meets the plate
// it is served on, and the slice inside runs the full height of it.
export const icon = [
  '........................',
  '........................',
  '........................',
  '...........441..........',
  '...........231..........',
  '............4...........',
  '........224222422.......',
  '.......24222222222......',
  '......2422222222222.....',
  '.....222222222222222....',
  '.....242222432222122....',
  '....22222333313322222...',
  '....22222333333322122...',
  '....42222244444322222...',
  '....42....33333...21....',
  '....22....11111...21....',
  '....22.....3333...22....',
  '....22......33....22....',
  '....4222222222222222....',
  '....1111111111111111....',
  '........42222222........',
  '........................',
  '........................',
  '........................',
];
