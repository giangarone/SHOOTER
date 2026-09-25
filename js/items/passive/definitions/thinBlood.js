import { definePassiveItem } from '../shared.js';

// THE WALLET AS A HEALTH BAR. A fifth of every hit comes off the BALANCE at
// ten credits the point, and only the remainder off the bar - so a run with
// money is a run with a second health pool the shop cannot touch. The rate
// is fixed both ways: $10 buys one point of ANY hit, and a wallet that cannot
// cover its share simply lands the shortfall as damage, which is what the
// card says happens.
//
// WHAT IT COSTS IS THE SHOP. The credits it drains are the credits that
// bought the next reroll, so the pick is a decision about what money is FOR
// - and late in a run, when the build is finished and the wallet is deep, it
// quietly becomes the best armour in the pool.
export const id = 'thinBlood';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'THIN BLOOD',
    max: 1,
    theme: 0xe05555,
    effects: [['20% OF DAMAGE TAKEN', GOOD], ['IS PAID IN CREDITS:', NOTE], ['$10/HP, ONLY IN CREDIT', BAD]],
    apply: (mods, n) => { mods.thinBlood = 0.2 * n; mods.thinBloodRate = 10; },
}));

// A DROPLET, DRAWN THIN. One elongated drop with a pale core - the shape of
// blood stretched to the point it stops being blood.
export const icon = [
  '........................',
  '........................',
  '............1...........',
  '...........441..........',
  '..........44221.........',
  '..........42221.........',
  '..........42221.........',
  '.........4432221........',
  '.........4432221........',
  '.........4432001........',
  '.........4432221........',
  '.........4430221........',
  '........444324421.......',
  '........424322221.......',
  '........424302221.......',
  '........424320021.......',
  '........424322221.......',
  '........424222421.......',
  '........422223221.......',
  '........122222211.......',
  '.........4222221........',
  '.........1122111........',
  '...........111..........',
  '........................',
];
