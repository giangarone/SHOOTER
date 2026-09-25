import { definePassiveItem } from '../shared.js';

export const id = 'pointBlank';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'POINT BLANK',
    max: 1,
    theme: 0xf4511e,
    // FIVE METRES IS INSIDE THE ARM'S REACH OF HALF THE ROSTER. That is the
    // whole deal: the bonus is only ever collected somewhere that is about to
    // cost health, which is what stops a flat +30% from being strictly better
    // than DARK POWER's +20% for free.
    //
    // A HARD EDGE HERE, where Longshot ramps, and the two are right for
    // opposite reasons. Longshot is about a slope the player rides; this is
    // about a LINE they either stepped over or did not, and the same five
    // metres is the number every melee reach in the game is already built
    // around - so it is a distance the player has learnt by being bitten at it.
    effects: [['+30% DAMAGE', GOOD], ['WITHIN 5m OF YOU', NOTE]],
    apply: (mods, n) => { mods.pointBlank = 0.3 * n; },
}));

export const icon = [
  '........................',
  '........................',
  '........................',
  '........................',
  '................4.......',
  '................2.......',
  '..............22222.....',
  '............22.....22...',
  '...........24.......22..',
  '...........4...222...2..',
  '..42221...2...2...2...2.',
  '..40001.3.4..2.433.2..2.',
  '..42221.4323.2.333.2..2.',
  '..40001.3.1..2.333.2..2.',
  '..42221...2...2...2...2.',
  '...........1...222...2..',
  '...........21.......22..',
  '............22.....22...',
  '..............22222.....',
  '................1.......',
  '................1.......',
  '........................',
  '........................',
  '........................',
];
