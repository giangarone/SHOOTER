import { definePassiveItem } from '../shared.js';

export const id = 'hotStreak';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'HOT STREAK',
    max: 1,
    theme: 0xff2e88,
    // The floor is REAL: miss enough and this deals less than no passive item at
    // all. That is the whole pick - every other damage passive item in the pool is
    // free once taken, and this one asks to be earned again every magazine.
    // It rides the same per-shot hit flag the hitmarker does, so the number
    // can never disagree with what the player just saw.
    effects: [['HITS: +1% DMG', GOOD], ['MISSES: -1% DMG', BAD], ['SWINGS +30% TO -10%', NOTE]],
    apply: (mods, n) => {
      mods.streakStep = 0.01 * n;
      mods.streakCap = 0.3;
      mods.streakFloor = 0.1;
    },
}));

export const icon = [
  '........................',
  '........................',
  '........................',
  '........................',
  '...............44442....',
  '...............43322....',
  '...............4332.....',
  '..............44332.....',
  '............444322321...',
  '...........4222222221...',
  '.........4422..222221...',
  '........4222...222221...',
  '.......442.....222221...',
  '.....4422222222222221...',
  '....4222.222222222221...',
  '...422...222222222221...',
  '...22....222222222221...',
  '.........222222222221...',
  '...222222222222222221...',
  '...222222222222222221...',
  '...222222222222222221...',
  '...111111111111111111...',
  '........................',
  '........................',
];
