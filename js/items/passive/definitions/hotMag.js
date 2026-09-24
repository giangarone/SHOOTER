import { definePassiveItem } from '../shared.js';

// HARM WANDS' EXACT OPPOSITE, and the two are meant to be found together: one
// is fastest at the bottom of a magazine and this is fastest at the top, so a
// build holding both fires at a rate that dips in the middle and peaks at
// either end. Owned alone it is a reason to reload EARLY, which is a decision
// nothing else in the pool asks for.
//
// A PERCENT PER ROUND is +30% on a default magazine and +45% on an EXTENDED
// MAG one, falling to nothing as it empties - so what it is worth over a
// whole magazine is roughly half its headline, which is what makes a number
// that large affordable.
//
// REFUSED UNDER BELT FED DREAM, in the getter. That pick has no magazine at
// all - see the note in Player.effectiveFireRate.
export const id = 'hotMag';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'HOT MAG',
    max: 1,
    theme: 0xff7f2a,
    effects: [['+1% FIRE RATE PER', GOOD], ['ROUND IN THE MAG', NOTE]],
    apply: (mods, n) => { mods.hotMag = 0.01 * n; },
}));

export const icon = [
  '........................',
  '........................',
  '........................',
  '........2...............',
  '.......42....2..........',
  '.......42....42.........',
  '......442....42.........',
  '......4332..442.........',
  '......4332..4332........',
  '......2332222331........',
  '......2222222221........',
  '......1222222211........',
  '.......22222221.........',
  '.......23333331.........',
  '.......23333331.........',
  '.......22222221.........',
  '.......23333331.........',
  '.......22222221.........',
  '.......22222221.........',
  '.......23333331.........',
  '.......22222221.........',
  '.......23333331.........',
  '.......23333331.........',
  '.......11111111.........',
];
