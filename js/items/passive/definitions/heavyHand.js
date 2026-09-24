import { definePassiveItem } from '../shared.js';

// The straight trade, and the only one in the pool that charges rate for
// damage rather than the other way round. Net DPS is a hair under even; what
// it actually buys is a bigger number per round, which is what matters
// against armour, against a boss, and to a magazine that has to last.
export const id = 'heavyHand';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'HEAVY HAND',
    max: 1,
    theme: 0xa93226,
    effects: [['+60% DAMAGE', GOOD], ['-40% FIRE RATE', BAD]],
    apply: (mods, n) => {
      mods.damage *= 1 + 0.6 * n;
      mods.fireRate *= Math.pow(0.6, n);
    },
}));

// THE ARMORED FIST. Knuckle plates up top, finger grooves across the
// mass, thumb wrapped over the palm and a studded bracer below - weight
// you can see, for the pick that trades rate for it.
export const icon = [
  '........................',
  '........................',
  '......44.44.44.44.......',
  '......433433433433......',
  '......330330330331......',
  '......433333333331......',
  '......200000000001......',
  '......233333333331......',
  '......200000000001......',
  '......233333333311......',
  '.....2334422222221......',
  '....23333322222221......',
  '.....2222222222221......',
  '......222222222221......',
  '......211111111111......',
  '......433333333331......',
  '......243124312331......',
  '.......2222222221.......',
  '........22222221........',
  '.........211111.........',
  '........................',
  '........................',
  '........................',
  '........................',
];
