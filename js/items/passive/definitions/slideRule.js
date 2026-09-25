import { definePassiveItem } from '../shared.js';

// THE SLIDE THAT PAYS IN ROUNDS. SCORCHED EARTH makes the slide an attack;
// this makes it a RELOAD, which is the more interesting half of the same move
// - a dive that ends with the gun full. It is deliberately a TRANSFER and
// not a startReload() with the clock zeroed: nothing is armed, nothing is
// seated, and the slide the player committed to costs exactly what it always
// did.
//
// TEN, CAPPED BY THE ROOM EACH SIDE HAS. A full magazine takes nothing and a
// dry reserve gives nothing, so the pick is worth exactly the gun's own
// shortfall - never more, never a jam.
export const id = 'slideRule';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'SLIDE RULE',
    max: 1,
    theme: 0x5aa9e6,
    effects: [['SLIDING LOADS', GOOD], ['10 ROUNDS INTO THE MAG', NOTE]],
    apply: (mods, n) => { mods.slideRule = 10 * n; },
}));

// THE CALCULATOR ITSELF. A slide rule is a ruler with a slider in the middle
// - drawn here as the outer bar with the sliding centre strip pulled out, the
// one shape that says "the rule you can move".
export const icon = [
  '........................',
  '........................',
  '........................',
  '........................',
  '..44444444444444444441..',
  '..42323232222222323231..',
  '..42020202222222020201..',
  '..11111112222211111111..',
  '.........433331.........',
  '.........434331.....1...',
  '.........433031..3411...',
  '.........43333144111....',
  '.........422222111......',
  '.........4222311........',
  '.........422221.........',
  '...444444111111.........',
  '...4234211..............',
  '...422221...............',
  '...423421...............',
  '...422221...............',
  '...423421...............',
  '...111111...............',
  '........................',
  '........................',
];
