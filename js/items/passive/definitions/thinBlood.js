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

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'THIN BLOOD',
    max: 1,
    theme: THEME.thinBlood,
    effects: [['20% OF DAMAGE TAKEN', GOOD], ['IS PAID IN CREDITS:', NOTE], ['$10/HP, ONLY IN CREDIT', BAD]],
    apply: (mods, n) => { mods.thinBlood = 0.2 * n; mods.thinBloodRate = 10; },
}));

// A DROPLET, DRAWN THIN. One elongated drop with a pale core - the shape of
// blood stretched to the point it stops being blood.
export const icon = [
  '........................',
  '........2222............',
  '.......233332...........',
  '......23333332..........',
  '.....2333333322.........',
  '.....2333443332.........',
  '....233344433322........',
  '....233344433322........',
  '....233334433322........',
  '....233333333322........',
  '....233333333322........',
  '....233333333322........',
  '....233333333322........',
  '....2333333333222.......',
  '....23333333332222......',
  '....23333333322222......',
  '.....2333333322222......',
  '.....2333333222222......',
  '......23333222222.......',
  '.......2333222222.......',
  '........23322222........',
  '.........2233222........',
  '..........22322.........',
  '...........22...........',
];
