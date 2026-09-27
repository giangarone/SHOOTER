import { definePassiveItem } from '../shared.js';

export const id = 'gracePeriod';

export default definePassiveItem(({ GOOD, BAD, NOTE }) => ({
    name: "GRACE PERIOD",
    max: 1,
    theme: 0xe8f5ff,
    effects: [['WHEN HIT:', NOTE], ['INVINCIBLE FOR 1s', GOOD]],
    apply: (mods, n) => { mods.gracePeriod = n; },
}));

// THE STILL HOURGLASS. Sand mid-fall, pale pile below, and the shimmer
// wrapped round the waist - one whole second the room cannot touch you.
export const icon = [
  '........................',
  '........................',
  '........22222221........',
  '.......4222222221.......',
  '.......2111111111.......',
  '.......2411111111.......',
  '.......2111111111.......',
  '.......2111111111.......',
  '....4...24333321........',
  '...3....23333321....4...',
  '...3......2331.......3..',
  '....4.....1331.......3..',
  '...........34.......4...',
  '..........4331..........',
  '........23333321........',
  '.......2333333331.......',
  '.......2333333331.......',
  '.......2111111111.......',
  '......422222222221......',
  '......111111111111......',
  '........................',
  '........................',
  '........................',
  '........................',
];

