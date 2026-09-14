import { definePassiveItem } from '../shared.js';

// TEN PERCENT OF EVERYTHING, and the colour of the room. The stats are
// deliberately small and deliberately unconditional - it is the one pick in
// the pool with nothing to learn and nothing to play around - so what it
// actually costs is the thing the game is hardest to read without: the enemy
// colours, the status tints, the theme light. The whole game, in grey.
export const id = 'grayMatter';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'GRAY MATTER',
    max: 1,
    theme: THEME.grayMatter,
    effects: [['+10% TO EVERY STAT', GOOD], ['THE WORLD TURNS GREY', BAD]],
    apply: (mods, n) => {
      mods.maxHpBonus += 10 * n;
      mods.damage *= 1 + 0.1 * n;
      mods.fireRate *= 1 + 0.1 * n;
      mods.moveMult *= 1 + 0.1 * n;
      mods.mono = n;
    },
}));
