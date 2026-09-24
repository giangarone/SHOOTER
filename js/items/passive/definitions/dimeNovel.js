import { definePassiveItem } from '../shared.js';

// THE PRESS PAYS THE GUN. Twenty seconds is long enough to be a window the
// player plays inside rather than a flash, and +20% on a 5% base is a fivefold
// crit rate for the whole of it - the second largest step the crit family
// has, behind IRON LITURGY's, and unlike that one it costs no change of play
// at all.
//
// WHAT IT ACTUALLY REWARDS IS SPENDING THE ITEM. The meter refills off orbs
// and kills whether it is full or not (charge earned past the cap is simply
// lost), so a player banking a press is already wasting charge; this makes
// the waste visible by paying the alternative. BAILIFF and VITAL TRIGGER are
// the same shape, and all three are meant to be found by the same run.
//
// OFF THE PRESS, not off the item's own window - it lands the moment the
// charge is spent and whatever the item then does, so it is worth exactly as
// much to PAY TO WIN's free press as to LANCE's.
export const id = 'dimeNovel';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'DIME NOVEL',
    max: 1,
    theme: 0xe8a0c8,
    effects: [['USING YOUR ITEM:', NOTE], ['+20% CRIT CHANCE', GOOD], ['FOR 20s', NOTE]],
    apply: (mods, n) => { mods.dimeCrit = 0.2 * n; mods.dimeTime = 20; },
}));

export const icon = [
  '........................',
  '........................',
  '....00022222222222221...',
  '....00022222222222200...',
  '....00022222222222200...',
  '....00022222222222200...',
  '....00022222222222200...',
  '....00022223333222200...',
  '....00022233333322200...',
  '....00022332222332200...',
  '....00023322332233200...',
  '....00023323333233200...',
  '....00023323333233200...',
  '....00023322332233200...',
  '....00022332222332200...',
  '....00022233333322200...',
  '....00022223333222200...',
  '....00022222222222200...',
  '....00022222222222200...',
  '....00022222222222200...',
  '....00022222222222200...',
  '....00022222222222200...',
  '....00011111111111111...',
  '........................',
];
