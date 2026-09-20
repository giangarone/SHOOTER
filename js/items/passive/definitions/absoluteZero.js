import { definePassiveItem } from '../shared.js';

export const id = 'absoluteZero';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'ABSOLUTE ZERO',
    max: 1,
    theme: THEME.zero,
    // 30% off everything hostile - bodies and their shots alike - against half
    // a second rooted every time one connects. The freeze is short on purpose:
    // it is the one drawback in the pool that takes the controls away, and a
    // full second of that at close range was a death sentence rather than a
    // price.
    effects: [['ENEMIES & SHOTS', GOOD], ['MOVE 30% SLOWER', NOTE], ['BEING HIT FREEZES YOU', BAD], ['FOR 0.5s', BAD]],
    apply: (mods, n) => {
      mods.worldSlow = Math.pow(0.7, n);
      mods.hitFreeze = 0.5;
    },
}));
