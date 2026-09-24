import { definePassiveItem } from '../shared.js';

// THE TACTICAL RELOAD, PAID. One round left in the magazine is a thing the
// player has to choose to stop at, which is the whole pick - it asks them to
// count, and it pays them 5 HP every time they get it right.
export const id = 'finalDose';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'FINAL DOSE',
    max: 1,
    theme: THEME.finalDose,
    effects: [['RELOAD WITH 1 ROUND', NOTE], ['LEFT: HEAL 5 HP', GOOD]],
    apply: (mods, n) => { mods.finalDose = 5 * n; },
}));

export const icon = [
  '........................',
  '........................',
  '........222222221.......',
  '........222222221.......',
  '........222222221.......',
  '........222222221.......',
  '........222222221.......',
  '........222222221.......',
  '........222222221.......',
  '........222333221.......',
  '........222333221.......',
  '........222333221.......',
  '........433333332.......',
  '........433333332.......',
  '........233333322.......',
  '.........2233321........',
  '.........2233321........',
  '.........2233321........',
  '.........1233311........',
  '..........12211.........',
  '...........431..........',
  '..........2422..........',
  '...........22...........',
  '........................',
];
