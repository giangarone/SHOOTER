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

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'SLIDE RULE',
    max: 1,
    theme: THEME.slideRule,
    effects: [['SLIDING LOADS', GOOD], ['10 ROUNDS INTO THE MAG', NOTE]],
    apply: (mods, n) => { mods.slideRule = 10 * n; },
}));

// THE CALCULATOR ITSELF. A slide rule is a ruler with a slider in the middle
// - drawn here as the outer bar with the sliding centre strip pulled out, the
// one shape that says "the rule you can move".
export const icon = [
  '........................',
  '........................',
  '...1111111111111111.....',
  '..133333333333333331....',
  '..133333333333333331....',
  '..133332111133333331....',
  '..133332111133333331....',
  '..122223333332222221....',
  '..122223333332222221....',
  '..122223333332222221....',
  '..133332111133333331....',
  '..133332111133333331....',
  '..133333333333333331....',
  '..133333333333333331....',
  '..133332111133333331....',
  '..133332111133333331....',
  '..122223333332222221....',
  '..122223333332222221....',
  '..122223333332222221....',
  '..133332111133333331....',
  '..133333333333333331....',
  '...1111111111111111.....',
  '........................',
  '........................',
];
