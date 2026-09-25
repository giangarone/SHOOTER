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
  '..........2.............',
  '.........222............',
  '.........232............',
  '........24322......44...',
  '....4...23322......4....',
  '.......2433322..........',
  '.......2233322...44.....',
  '.......2233322...4......',
  '.......2233322..........',
  '.......2223222.44.......',
  '........22322..4........',
  '....111.22322...........',
  '.........212............',
  '..........3.............',
  '....4433333333322222....',
  '....1111111111111111....',
  '........................',
  '........................',
  '........................',
  '........................',
];
