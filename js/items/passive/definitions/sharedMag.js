import { definePassiveItem } from '../shared.js';

// ---- the turrets, which were one item and are now a family --------------

// THE SENTRY, FED FROM YOUR OWN BELT. A turret's damage is snapshotted at the
// throw - one of the player's shots - and three times that is a second gun
// worth having rather than a decoration, which is what LITTLE BROTHER has
// always struggled to be next to the things the player can aim.
//
// IT COSTS A ROUND A SHOT, and a turret fires twice a beat: about four rounds
// a second, per turret, off the same reserve the player is shooting out of. A
// build running QUORUM's three at once is spending twelve rounds a second on
// them, which is the real price and is why the reserve cap matters to this
// pick more than to any other.
//
// AND OUT OF AMMUNITION IT KEEPS SHOOTING, at the ordinary number. That is
// the line that makes it safe to take blind: the worst case is the turret the
// player already had, never a turret that has stopped working - which is what
// a version that simply refused to fire would have been.
export const id = 'sharedMag';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'SHARED MAG',
    max: 1,
    theme: THEME.sharedMag,
    effects: [
      ['TURRETS DRAW FROM YOUR', NOTE],
      ['RESERVE FOR 3x DAMAGE', GOOD],
      ['EMPTY RESERVE: NORMAL', NOTE],
    ],
    apply: (mods, n) => { mods.sharedMag = 3 * n; mods.sharedMagCost = 1; },
}));

export const icon = [
  '........................',
  '..................44442.',
  '..................23322.',
  '...................432..',
  '...................432..',
  '...................432..',
  '...................432..',
  '...................432..',
  '...................432..',
  '...222222222221....422..',
  '...220002222221....42...',
  '...200000222222444422...',
  '...20000022222333221....',
  '...20000222222211111....',
  '...222022222221.........',
  '...112222221111.........',
  '.....2222221............',
  '.....2222221............',
  '....222221121...........',
  '....211221.21...........',
  '...221.221.121..........',
  '...211.221..21..........',
  '...21..121..121.........',
  '...11...11...11.........',
];
