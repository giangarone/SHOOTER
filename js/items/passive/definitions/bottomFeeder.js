import { definePassiveItem } from '../shared.js';

// DAMAGE OFF AN EMPTY GUN. The only pick in the pool that pays for running
// dry, which is the one thing every other ammunition pick in the game is
// trying to stop the player doing.
export const id = 'bottomFeeder';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'BOTTOM FEEDER',
    max: 1,
    theme: 0xc0ca33,
    effects: [['RELOAD ON AN EMPTY', NOTE], ['MAG: +20% DMG FOR 5s', GOOD]],
    apply: (mods, n) => { mods.bottomFeed = 0.2 * n; mods.bottomTime = 5; },
}));

export const icon = [
  '........................',
  '........................',
  '..........2.............',
  '..........2.............',
  '.........2222...........',
  '.........2202...........',
  '.........4444...........',
  '........433334..........',
  '........242222..........',
  '........222222..........',
  '......20000002..........',
  '.....2242222222.........',
  '.....2222000021.........',
  '.....2222000021.........',
  '.....2222222221.........',
  '.....2222222221.........',
  '.....2222222221.........',
  '.....1111111111.........',
  '........34..............',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
];
