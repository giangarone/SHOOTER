import { definePassiveItem } from '../shared.js';

export const id = 'steadyAim';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'STEADY AIM',
    max: 2,
    theme: 0x7c4dff,
    effects: (n) => [
      ['DAMAGE ' + step(n, pctUp(40)), GOOD],
      ['WHILE STANDING STILL', NOTE],
    ],
    apply: (mods, n) => { mods.steady += 0.4 * n; },
}));

// THE PINNED RETICLE. A mil-dot scope with its pale center, locked onto
// a mounting pillar and a rock it cannot be knocked off - damage for the
// run that plants its feet.
export const icon = [
  '........................',
  '........................',
  '..........4331..........',
  '........43333331........',
  '.......4223322221.......',
  '.......3223322221.......',
  '.......3232223231.......',
  '.......3333344331.......',
  '.......3222233221.......',
  '.......2222332221.......',
  '........22233222........',
  '..........2221..........',
  '..........3221..........',
  '..........3221..........',
  '..........3111..........',
  '.......4333333331.......',
  '......422222222221......',
  '.....20000000000001.....',
  '..3.2222222222222221.3..',
  '....1111111111111111....',
  '........................',
  '........................',
  '........................',
  '........................',
];
