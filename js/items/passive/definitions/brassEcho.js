import { definePassiveItem } from '../shared.js';

// A REFUND, NOT INCOME. Scavenger and Ammo Fabricator both make rounds out
// of nothing; this one only ever gives back what a shot that CONNECTED cost,
// so it pays accuracy rather than time spent holding the trigger. Rolled
// once per shot and refunding the whole shotCost, so a Triple Tap build gets
// three rounds back on the shots it wins - the refund is worth exactly what
// the trigger pull was.
export const id = 'brassEcho';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'BRASS ECHO',
    max: 3,
    theme: 0x6fd8c8,
    effects: (n) => [
      ['HITS REFUND AMMO', GOOD],
      ['CHANCE ' + step(n, pctUp(5)), NOTE],
    ],
    apply: (mods, n) => { mods.ammoRefund = 0.05 * n; },
}));

// THE ROUND THAT COMES BACK. One cartridge standing on its own report -
// the shot's ring rolling back under it, rung twice, bright at the tips.
export const icon = [
  '........................',
  '........................',
  '........................',
  '...........33...........',
  '..........4331..........',
  '.........423321.........',
  '........24222221........',
  '........24222221........',
  '........24222221........',
  '........24222221........',
  '........24222221........',
  '........00222221........',
  '.......2222222221.......',
  '.......1111111111.......',
  '........................',
  '.......4........4.......',
  '....4..33......33..4....',
  '....43...333333...34....',
  '.....3............3.....',
  '......33........33......',
  '........33333333........',
  '........................',
  '........................',
  '........................',
];
