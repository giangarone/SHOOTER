import { definePassiveItem } from '../shared.js';

// THE PLAIN RED PICK. Thirty percent, no riders, no window, nothing to read
// but the number. Every damage pick in the pool buys its percentage with
// SOMETHING - a posture, a distance, a clock, a coin toss - and this one is
// deliberately the floor the rest are priced against: the pick a player
// takes when they do not want a puzzle, and the reason every other damage
// number in the pool has to be bigger than thirty to be worth its clause.
export const id = 'killSwitch';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'KILL SWITCH',
    max: 1,
    theme: THEME.killSwitch,
    effects: [['+30% DAMAGE', GOOD]],
    apply: (mods, n) => { mods.damage *= 1 + 0.3 * n; },
}));

// THE SWITCH, THROWN. A toggle on a plate, lever up - the one glyph that
// means "on, and now everything is different".
export const icon = [
  '........................',
  '........................',
  '........23332...........',
  '.......2333332..........',
  '......23333332..........',
  '......233333332.........',
  '......2333333322........',
  '......2333333322........',
  '......2333333332........',
  '......2333333332........',
  '......2333333332........',
  '......2333333332........',
  '.....22333333332........',
  '....22333333333322......',
  '...22333333333333332....',
  '...23333333333333332....',
  '...23333333333333332....',
  '...22333333333333332....',
  '....223333333333322.....',
  '......2222222222222.....',
  '.....22112222221122.....',
  '.....22222222222222.....',
  '........................',
  '........................',
];
