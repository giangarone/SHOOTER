import { definePassiveItem } from '../shared.js';

// THE PITY TIMER, AND IT IS COUNTED IN SHOTS THAT LANDED. A trigger pull
// that touched nothing is not a drought, it is a miss - counting those would
// make the pick pay for shooting at a wall, which is the one thing in the
// game that should never pay. Five is short enough to land twice a magazine
// at the base crit rate and long enough that a DEADEYE build rarely reaches
// it, so the pick is worth most to the run that has nothing else.
//
// FIVE TIMES, FLAT, and not five times critMult: it is a number the card
// states outright, and a mega-crit that quietly got bigger with the rest of
// the crit family would be the one line in the pool that cannot be checked.
export const id = 'pityParty';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'PITY PARTY',
    max: 1,
    theme: 0xff4081,
    effects: [['AFTER 5 NON-CRIT HITS:', NOTE], ['NEXT HIT IS A 5x CRIT', GOOD]],
    apply: (mods, n) => { mods.pityAfter = 5; mods.pityMult = 5 * n; },
}));

export const icon = [
  '........................',
  '........................',
  '........................',
  '........................',
  '...21..21..21..21.......',
  '...21..21..21..21...2...',
  '...21..21..21..21.4422..',
  '...21..21..21..234222...',
  '...21..21..21.44222.....',
  '...11..11..234422.......',
  '..21..21..443332........',
  '..21..2244422221........',
  '..21..433332..21........',
  '..21.4422221..21........',
  '..234432..21..21...2....',
  '.4422221..21..21...2....',
  '2432..21..21..21...42...',
  '.221..21..21..21.44432..',
  '..11..11..11..112233222.',
  '..................222...',
  '...................2....',
  '...................2....',
  '........................',
  '........................',
];
