import { definePassiveItem } from '../shared.js';

// THE KILLING WEATHER. A kill inside five seconds of the last one is a stack
// of three percent fire rate, ten stacks deep - thirty percent at the eye of
// a chain - and the whole thing is gone the instant five seconds pass without
// a body. LOST, not decayed, deliberately: a ramp that bled would be a number
// the player could wait out, and the shape of the pick is a chain they keep
// breaking by stopping.
//
// THE FIRST KILL IS FREE ARMING, not a stack: `lastKillAt` starts at -99, so
// the first body of a wave opens the window rather than paying into it - and
// the second one within five seconds is the first stack.
export const id = 'monsoon';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'MONSOON',
    max: 1,
    theme: 0x00796b,
    effects: [['KILLS 5s APART STACK', GOOD], ['+3% FIRE RATE, MAX 10', NOTE]],
    apply: (mods, n) => {
      mods.monsoon = 0.03 * n;
      mods.monsoonWindow = 5;
      mods.monsoonCap = 10;
    },
}));

// THE DOWNPOUR. Diagonal rain in two weights and a burst of lightning
// through it - the one weather that says "everything, all at once".
export const icon = [
  '3.3..3.3..3.3..3.3......',
  '.3..3..3..3..3..3.......',
  '..3..3..3..3..3..3......',
  '3.3..3.3..3.3..3.3......',
  '.3..3..3..3..3..3.......',
  '..3..3..3..3..3..3......',
  '3.3..3.3..3.3..3.3......',
  '.3..3..3..3..3..3.......',
  '44..44..44..44..44......',
  '.44.44.44.44.44.44......',
  '..4.4..4.4..4.4..4......',
  '44444444444444444.......',
  '..4.4..4.4..4.4..4......',
  '.44.44.44.44.44.44......',
  '..3..3..3..3..3..3......',
  '3.3..3.3..3.3..3.3......',
  '.3..3..3..3..3..3.......',
  '..3..3..3..3..3..3......',
  '3.3..3.3..3.3..3.3......',
  '.3..3..3..3..3..3.......',
  '..3..3..3..3..3..3......',
  '3.3..3.3..3.3..3.3......',
  '.3..3..3..3..3..3.......',
  '........................',
];
