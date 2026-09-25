import { definePassiveItem } from '../shared.js';

export const id = 'ammoFab';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'AMMO FABRICATOR',
    max: 3,
    theme: 0xffe57f,
    // Combat only, like Nanoweave: the wave break has no clock on it, and a
    // trickle that ran there was an infinite ammo box you reached by waiting.
    effects: (n) => [
      ['AMMO / SEC ' + step(n, (k) => '+' + 2.5 * k), GOOD],
      ['IN COMBAT ONLY', NOTE],
    ],
    apply: (mods, n) => { mods.ammoRegen += 2.5 * n; },
}));

export const icon = [
  '........................',
  '........................',
  '.......2222222222.......',
  '........24422222........',
  '.........242222.........',
  '..........2222..........',
  '.......2442222222.......',
  '.......2200022332.......',
  '.......2023202341.......',
  '.......2000202331.......',
  '.......2023202331.......',
  '.......2200022221.......',
  '.......2222222221.......',
  '......222222222222......',
  '......22222222333342....',
  '......11111111111111....',
  '..................43....',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
];
