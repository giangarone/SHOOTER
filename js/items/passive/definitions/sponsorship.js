import { definePassiveItem } from '../shared.js';

export const id = 'sponsorship';

export default definePassiveItem(({ GOOD, BAD, NOTE }) => ({
    name: "SPONSORSHIP",
    max: 1,
    theme: 0xf28700,
    effects: [['+2% FIRE RATE PER ITEM', GOOD], ['MAX +30%', NOTE]],
    apply: (mods, n) => { mods.sponsorship = 0.02 * n; },
}));

// THE SPONSOR'S SEAL. A scalloped rosette with a starred face, notched
// ribbons below, and the speed ticks of the rate it pays flying off it -
// every item in the run wearing the brand.
export const icon = [
  '........................',
  '...........4............',
  '........................',
  '..........4331..........',
  '........43333331........',
  '.......4322222231.......',
  '.....3.3222422221.3.....',
  '.......3223433221.......',
  '....3..3334333331..3....',
  '.......3223333221.......',
  '.....3.3223223221.3.....',
  '.......2222222221.......',
  '........21111111........',
  '.......233....332.......',
  '......2333....3332......',
  '......2331....3321......',
  '......2300....0032......',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
];

