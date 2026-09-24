import { definePassiveItem } from '../shared.js';

export const id = 'ammoFab';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'AMMO FABRICATOR',
    max: 3,
    theme: THEME.fabricate,
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
  '..12222222222222222211..',
  '...122222222222222211...',
  '....1222222222222211....',
  '.....12222222222211.....',
  '......122222222211......',
  '.......1222222211.......',
  '........12222211........',
  '.........122221.........',
  '..........22221.........',
  '..........22221.........',
  '..........11111.........',
  '........................',
  '.........4444442........',
  '.........4333332........',
  '.........4333332........',
  '.........4333332........',
  '.........4333332........',
  '.........4333332........',
  '.........4333332........',
  '.........2333322........',
  '..........23322.........',
  '...........222..........',
];
