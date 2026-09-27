import { definePassiveItem } from '../shared.js';

export const id = 'parrot';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'PARROT',
    max: 1,
    theme: 0xff6e6e,
    // AN ECHO WITH WINGS. It listens to the one funnel every press goes
    // through (see onItemUsed in main.js), and at most once every thirty
    // seconds it memorises one; five seconds later it plays the press back
    // through the same running list, free. The bird copies the press, NOT
    // the bill - items whose use charges credits, rounds or health are never
    // mimicked, and the item's own ready() is still asked at fire time.
    effects: [['REPEATS YOUR ACTIVE', GOOD], ['ITEM 5s LATER', GOOD], ['EVERY 30s', NOTE]],
    apply: (mods, n) => { mods.parrot = n; },
}));

// A perched macaw in profile, facing right: crest up, hooked beak, beady eye,
// the wing's energy stripe, claws on the branch, and the long tail hanging
// past it - half the bird, exactly as it is in the air.
export const icon = [
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '..........333...........',
  '..........4222..........',
  '..........24022.........',
  '..........222422........',
  '..........222221........',
  '.........222221.........',
  '........22222221........',
  '........22222221........',
  '........23333221........',
  '......21.2422221........',
  '.....2212222221.........',
  '.....1111441111111111...',
  '......21................',
  '.....221................',
  '....211.................',
  '....43..................',
  '........................',
  '........................',
  '........................',
];