import { definePassiveItem } from '../shared.js';

export const id = 'deadCat';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'DEAD CAT',
    max: 1,
    theme: 0xea80fc,
    effects: [['REVIVE ONCE AT 1 HP', GOOD], ['-40% MAX HEALTH', BAD]],
    apply: (mods, n) => {
      mods.extraLives += n;
      mods.maxHpMult *= Math.pow(0.6, n);
    },
}));

// ONE LIFE LEFT. A tabby curled asleep with its tail tucked, a ghost wisp
// already leaving, and the single heart floating above that says what comes
// back at one health - plus the pip that counts it.
export const icon = [
  '........................',
  '........................',
  '...2.............3223...',
  '....2............4331...',
  '...2..............31....',
  '........4......4........',
  '.......433....334.......',
  '.......4333333331.......',
  '.......4200220021.......',
  '.......4222222221.......',
  '......433333333331......',
  '......432323232321......',
  '......232323232321......',
  '......432323232321......',
  '......442222222221......',
  '.......2111111111.......',
  '........................',
  '...................4....',
  '..................343...',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
];
