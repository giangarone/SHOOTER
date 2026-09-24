import { definePassiveItem } from '../shared.js';

export const id = 'absoluteZero';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'ABSOLUTE ZERO',
    max: 1,
    theme: 0x4fc3f7,
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

export const icon = [
  '........................',
  '........................',
  '........................',
  '......222222222221......',
  '.....22222222222221.....',
  '....222222222222221.....',
  '....2222222332222221....',
  '...222233223322332221...',
  '...222223333333322211...',
  '...12222233333322221....',
  '....2222233333322221....',
  '....2222333333332211....',
  '....122332233223321.....',
  '.....22222233222221.....',
  '.....22222222222211.....',
  '.....1222222222221......',
  '......211112111121......',
  '.....422...42...222.....',
  '.....22....42....2......',
  '......2....42....2......',
  '......2....22...........',
  '........................',
  '........................',
  '........................',
];
