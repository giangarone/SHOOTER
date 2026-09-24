import { definePassiveItem } from '../shared.js';

export const id = 'neurotoxin';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'NEUROTOXIN',
    max: 1,
    theme: THEME.poison,
    // Slowing a poisoned enemy would have been Cryo Rounds with a different
    // name - Cryo already halves their speed and their shots. Spreading is the
    // thing only poison does.
    effects: [['POISON SPREADS BETWEEN', GOOD], ['ENEMIES WITHIN 3m', NOTE]],
    apply: (mods, n) => { mods.poisonSpread = 3 * n; },
}));

export const icon = [
  '........................',
  '........................',
  '........................',
  '....221.................',
  '...22221..........1.....',
  '..2233321.......22221...',
  '..22333222221..2223221..',
  '..12333111111112233321..',
  '...12221.......2233321..',
  '....1121.......1223211..',
  '......11........11111...',
  '.......21......21.1.....',
  '.......11.....211.......',
  '........21....11........',
  '........21...11.........',
  '........222221..........',
  '........222221..........',
  '........223321..........',
  '.......22333321.........',
  '.......12333311.........',
  '........223321..........',
  '........112111..........',
  '..........11............',
  '........................',
];
