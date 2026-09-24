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

export const icon = [
  '........................',
  '........................',
  '...........21...........',
  '.....44422220221........',
  '....44322222022221......',
  '....432222220222221.....',
  '....4222222202222221....',
  '....4333222202222221....',
  '...243332222022222221...',
  '...233333222022222221...',
  '...233232222022222221...',
  '...232222222022222221...',
  '...233332222022222221...',
  '...133332222022222211...',
  '....4333322202222221....',
  '....4222222202222211....',
  '....432222220222221.....',
  '....232222220222211.....',
  '.....2333222022111......',
  '......2222220221........',
  '.........2220221........',
  '.........2222221........',
  '.........1111111........',
  '........................',
];
