import { definePassiveItem } from '../shared.js';

// THE PICK THAT WATCHES YOUR BACK. One pellet straight behind on every
// trigger pull, at FULL damage - deliberately not a discount shot, because a
// half-strength backwards round would be a fire hazard rather than a weapon.
// It fires whether or not anything is there, exactly as the forward ones do,
// and it comes off no magazine at all: the card says "as well", not "instead".
//
// ONE PELLET, not the pattern: a shotgun already fires a wall forward, and a
// second wall backwards would be a different weapon entirely. The single
// round behind is the readable version - the thing chasing you gets exactly
// what was coming to it.
export const id = 'rearview';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'REARVIEW',
    max: 1,
    theme: 0xff9e80,
    effects: [['EVERY SHOT FIRES ONE', GOOD], ['BACKWARD, FULL DAMAGE', NOTE]],
    apply: (mods, n) => { mods.rearview = n; },
}));

// THE MIRROR WITH A ROUND LEAVING IT BACKWARDS. The rounded frame, the
// glass catching the light, and the one rearward round below it.
export const icon = [
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '....2222222222222222....',
  '....2444444443344442....',
  '....2222222233200022....',
  '....2222222332200022....',
  '....2222223322222222....',
  '....2222233222222222....',
  '....2222332222222222....',
  '....2224322222222222....',
  '....2243222222222222....',
  '....2222222222222222....',
  '....1111111111111111....',
  '...........42...........',
  '...........22...........',
  '.........222222.........',
  '...4.....111111.........',
  '....44222222233.........',
  '...1....................',
  '........................',
];
