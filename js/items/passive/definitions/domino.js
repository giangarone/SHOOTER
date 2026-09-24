import { definePassiveItem } from '../shared.js';

// ONE CRIT LEANING ON THE NEXT. At the base 5% it is a small nudge; on top of
// Deadeye and Marksman it is a chain that keeps itself going, which is the
// only kind of scaling the crit family does not already have.
export const id = 'domino';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'DOMINO',
    max: 1,
    theme: 0xc2185b,
    effects: [['AFTER A CRIT: NEXT', NOTE], ['SHOT HAS +30% CRIT', GOOD]],
    apply: (mods, n) => { mods.domino = 0.3 * n; },
}));

export const icon = [
  '........................',
  '......2222222222221.....',
  '......2222222222221.....',
  '......2222222222221.....',
  '......2222233222221.....',
  '......2222333322221.....',
  '......2222333322221.....',
  '......2222233222221.....',
  '......2222222222221.....',
  '......2222222222221.....',
  '......2222222222221.....',
  '......2222222222221.....',
  '......0000000000000.....',
  '......2222222222221.....',
  '......2233322333221.....',
  '......2233322333221.....',
  '......2233322333221.....',
  '......2222222222221.....',
  '......2233322333221.....',
  '......2233322333221.....',
  '......2233322333221.....',
  '......2222222222221.....',
  '......2222222222221.....',
  '......1111111111111.....',
];
