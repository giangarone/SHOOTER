import { definePassiveItem } from '../shared.js';

// ONE CRIT LEANING ON THE NEXT. At the base 5% it is a small nudge; on top of
// Deadeye and Marksman it is a chain that keeps itself going, which is the
// only kind of scaling the crit family does not already have.
export const id = 'domino';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'DOMINO',
    max: 1,
    theme: 0xeceff1,
    effects: [['AFTER A CRIT: NEXT', NOTE], ['SHOT HAS +30% CRIT', GOOD]],
    apply: (mods, n) => { mods.domino = 0.3 * n; },
}));

export const icon = [
  '........................',
  '........................',
  '........................',
  '.........222222.........',
  '........24444442........',
  '........42222221........',
  '........42022221........',
  '........42222221........',
  '........42222221........',
  '........42222021........',
  '........42222221........',
  '........42222221........',
  '........00000000........',
  '........42222221........',
  '........42022221........',
  '........42222221........',
  '........42220221........',
  '........42222221........',
  '........42222201........',
  '........22222221........',
  '........11111111........',
  '.........111111.........',
  '........................',
  '........................',
];
