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

export const icon = [
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '.......444444444........',
  '.......444444444........',
  '.......433333332........',
  '.......433333332........',
  '.......433333332........',
  '.....2222222222222222221',
  '...222222222222221111111',
  '.22222211222211111......',
  '.2222221.22221..........',
  '.1222221.20001..........',
  '..222111.2221...........',
  '..2111..22221...........',
  '..11....22221...........',
  '..1.....22211...........',
  '........1111............',
  '........................',
  '........................',
  '........................',
];
