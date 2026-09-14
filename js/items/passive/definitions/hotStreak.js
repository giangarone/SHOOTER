import { definePassiveItem } from '../shared.js';

export const id = 'hotStreak';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'HOT STREAK',
    max: 1,
    theme: THEME.streak,
    // The floor is REAL: miss enough and this deals less than no passive item at
    // all. That is the whole pick - every other damage passive item in the pool is
    // free once taken, and this one asks to be earned again every magazine.
    // It rides the same per-shot hit flag the hitmarker does, so the number
    // can never disagree with what the player just saw.
    effects: [['HITS: +1% DMG', GOOD], ['MISSES: -1% DMG', BAD], ['RANGE +30% TO -10%', NOTE]],
    apply: (mods, n) => {
      mods.streakStep = 0.01 * n;
      mods.streakCap = 0.3;
      mods.streakFloor = 0.1;
    },
}));
