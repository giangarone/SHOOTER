import { definePassiveItem } from '../shared.js';

// ---- THE CRIT FAMILY, THREE MORE ----------------------------------------

// THE PAUSE IS THE PICK. Two seconds off the trigger buys four certain
// crits, which is a burst rather than a rate - it pays the player who taps
// and takes cover and pays nothing at all to one holding the trigger down.
export const id = 'trueStrike';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'TRUE STRIKE',
    max: 1,
    theme: 0xff5a7a,
    effects: [
      ['+10% CRIT DAMAGE', GOOD],
      ['HOLD FIRE 2s, THEN:', NOTE],
      ['NEXT 4 SHOTS CRIT', GOOD],
    ],
    apply: (mods, n) => {
      mods.critMult *= 1 + 0.1 * n;
      mods.trueStrikeWait = 2;
      mods.trueStrikeShots = 4 * n;
    },
}));

export const icon = [
  '........................',
  '........................',
  '........................',
  '...........444..........',
  '.........4442241........',
  '........411231121.......',
  '......4411.421.1241.....',
  '......431..421..131.....',
  '.....411...111...121....',
  '....411...........121...',
  '....41.....441.....41...',
  '...442441.44321.444421..',
  '...423221.43431.422321..',
  '...121111.12311.111211..',
  '....41.....111.....41...',
  '....121...........411...',
  '.....121...441...411....',
  '......431..421..431.....',
  '......1121.421.4111.....',
  '........124432411.......',
  '.........1122111........',
  '...........111..........',
  '........................',
  '........................',
];
