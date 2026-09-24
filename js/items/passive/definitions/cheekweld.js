import { definePassiveItem } from '../shared.js';

export const id = 'cheekweld';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'CHEEKWELD',
    max: 1,
    theme: 0x00acc1,
    // ARMOUR ON A POSTURE THAT USED TO BE ALL COST. Aiming already trades
    // movement for accuracy, which in a game about crowds is a trade the
    // player mostly declines - so the sights are the one thing in the control
    // scheme a build could ignore entirely. A fifth off every hit taken while
    // they are up is a reason to be standing there.
    //
    // READ LIVE OFF `aiming`, the same flag the gun's own raise rides, so it
    // arrives on the frame the button lands rather than at the end of the
    // half-second the weapon takes to come up. The player is protected by the
    // DECISION, not by the animation finishing.
    effects: [['TAKE 20% LESS DAMAGE', GOOD], ['WHILE AIMING', NOTE]],
    apply: (mods, n) => { mods.aimGuard = Math.min(0.9, 0.2 * n); },
}));

// THE SIGHTS, DUG IN. A scoped rifle with its cheek pad glowing on the
// stock and a guard arc cupped underneath - armour for the posture that
// used to be all cost.
export const icon = [
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '.........433331.........',
  '........42433321........',
  '.........2...2..........',
  '..222222222224444441....',
  '..222222222223333331....',
  '..222222203222333331....',
  '..222122122222333331....',
  '..223333222221111111....',
  '..33222233..............',
  '..22111122..............',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
];
