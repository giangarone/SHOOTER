import { definePassiveItem } from '../shared.js';

export const id = 'berserker';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'BERSERKER',
    max: 2,
    theme: THEME.rage,
    // Deliberately no numbers: the shape of the deal is the whole pick, and a
    // percentage that only pays at an HP the player is trying not to be at
    // told them less than the sentence does.
    effects: [
      ['LOW HEALTH =', NOTE],
      ['MORE DAMAGE DEALT', GOOD],
    ],
    apply: (mods, n) => { mods.berserk += 0.5 * n; },
}));

export const icon = [
  '........................',
  '........................',
  '........................',
  '........................',
  '.......221....421.......',
  '.....2222221.242221.....',
  '....22222221.2332221....',
  '....22222221.2333221....',
  '....22222221.2233321....',
  '....22222221.2233321....',
  '....22222221.2222221....',
  '....12222221.2232211....',
  '.....1222221.123311.....',
  '......122221..2331......',
  '.......122221.2332......',
  '........22221.23322.....',
  '........12221.4322......',
  '.........1221.422.......',
  '..........121.22........',
  '...........21.2.........',
  '...........112..........',
  '........................',
  '........................',
  '........................',
];
