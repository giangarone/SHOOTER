import { definePassiveItem } from '../shared.js';

// TELLTALE'S PATIENT COUSIN. That one turns the third hit on a body into a
// crit; this one turns the body itself into a soft target, permanently, for
// everything - the gun, a turret, poison, a blast, another enemy's friendly
// fire. Three hits is one burst.
export const id = 'weakPoint';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'WEAK POINT',
    max: 1,
    theme: 0xff4fa3,
    effects: [
      ['3 HITS ON AN ENEMY', GOOD],
      ['MARK IT: +50% DMG TAKEN', NOTE],
      ['FROM ALL SOURCES', NOTE],
    ],
    apply: (mods, n) => { mods.markHits = 3; mods.markBonus = 0.5 * n; },
}));

export const icon = [
  '........................',
  '...........42...........',
  '..........2431..........',
  '........22432221........',
  '......222233222221......',
  '.....22222332222221.....',
  '...222222232222222221...',
  '...222222332222222221...',
  '...222222332222222221...',
  '...222223333222222221...',
  '...222333233322222221...',
  '...233322223333222221...',
  '...232222222233322221...',
  '...222222222223322221...',
  '...222222222233222221...',
  '...222222222233222221...',
  '...222222222332222221...',
  '...112222222332222111...',
  '.....11222233222111.....',
  '.......1222332211.......',
  '........11332111........',
  '..........2211..........',
  '..........2.............',
  '........................',
];
