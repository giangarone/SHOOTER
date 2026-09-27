import { definePassiveItem } from '../shared.js';

export const id = 'rubberChicken';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'RUBBER CHICKEN',
    max: 1,
    theme: 0xffdf3e,
    // THE DECOY THAT IS ALREADY THERE. The monkey is thrown - you pick the
    // ground and spend the charge. The chicken trots at your heel being
    // nobody, and the frame a hit lands it plants and becomes the loudest
    // thing in the room for three seconds: the whole crowd aims at IT. It is
    // a lure on the monkey's own terms (see _findLure in main.js), answered
    // by a pet instead of a deployable because it was never thrown.
    effects: [['WHEN YOU ARE HIT,', GOOD], ['EVERYTHING AIMS AT', GOOD], ['IT FOR 3s', GOOD]],
    apply: (mods, n) => { mods.rubberChicken = n; },
}));

// THE SQUEAK, FROZEN MID-FLAIL. Head thrown skyward with the beak open and
// the comb up, bulging eye, wings out, legs dangling their flat feet - and
// the two motion ticks beside the comb that are the only noise an icon can
// make.
export const icon = [
  '........................',
  '........................',
  '....4...................',
  '...4.........333........',
  '............433.43......',
  '...........2244.332.....',
  '...........2404221......',
  '...........222221.......',
  '..........1222221.......',
  '..........2222..........',
  '......22.22222..........',
  '.....212.2222221........',
  '......2222222221........',
  '.....22222222221........',
  '.....442222222221.......',
  '.....2222222222211......',
  '......22222222221.......',
  '.......222222221........',
  '.........22..22.........',
  '.........11..11.........',
  '.........22..22.........',
  '........442.244.........',
  '........................',
  '........................',
];