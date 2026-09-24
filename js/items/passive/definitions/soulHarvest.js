import { definePassiveItem } from '../shared.js';

// A KILL, ONE TIME IN FIVE, BANKS A POINT OF SHIELD. Shield here is the
// game's own - spent first and fully, no timer - and the point is DELIBERATELY
// one: a kill is the most common event in the game and a bigger number would
// turn every wave into a full shield by the middle of it. What the pick
// actually sells is a run that walks into a fight with something already in
// front of the bar.
//
// THE CLOCK IS CANCELLED, on SECOND SKIN's terms and for its reason: a point
// counting down on a timer the kill did not start is the one behaviour a
// player could not predict.
export const id = 'soulHarvest';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'SOUL HARVEST',
    max: 1,
    theme: 0xab47bc,
    effects: [['20% CHANCE A KILL', GOOD], ['BANKS 1 SHIELD', NOTE]],
    apply: (mods, n) => { mods.soulHarvest = 0.2 * n; },
}));

// A SOUL RISING OUT OF A SKULL. The harvested spirit: the skull below, the
// flame-lit soul lifting off it - the one shape that says the kill paid
// something that stays.
export const icon = [
  '.........2..2...........',
  '........233332..........',
  '.......23333332.........',
  '.......23443332.........',
  '......2334433322........',
  '......2334433322........',
  '.......23333332.........',
  '........2333322.........',
  '.........23322..........',
  '..........232...........',
  '........................',
  '.......22222222.........',
  '.....223333333322.......',
  '....2333333333332.......',
  '...233333333333332......',
  '..2333.2333.2333332.....',
  '..2333.2333.2333332.....',
  '..23333333333333332.....',
  '..233333.22.2333332.....',
  '..23333332223333332.....',
  '..23333333333333332.....',
  '..2233333333333322......',
  '....2233333333222.......',
  '......2222222222........',
];
