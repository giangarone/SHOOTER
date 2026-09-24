import { definePassiveItem } from '../shared.js';

export const id = 'assassin';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'ASSASSIN',
    max: 1,
    theme: THEME.assassin,
    // THE FIRST HIT ON A FRESH BODY, and once a body has been touched it is
    // never fresh again - not by healing, not by a wave boundary, because the
    // body itself does not survive either. So this pays exactly once per enemy
    // in the run, which is what makes it a CROWD pick rather than a boss one:
    // it is worth the most in the wave with thirty chasers in it and worth a
    // single opening round against a boss.
    //
    // It is also the only thing in the pool that rewards SPREADING fire, which
    // is the opposite of everything else a player has been taught - and that
    // is the pick.
    effects: [['FIRST HIT ON ANY', NOTE], ['ENEMY IS ALWAYS A CRIT', GOOD]],
    apply: (mods, n) => { mods.assassin = n; },
}));

export const icon = [
  '........................',
  '........................',
  '...........21...........',
  '..........221...........',
  '..........2231..........',
  '.........222321.........',
  '.........222331.........',
  '........22223321........',
  '........22223321........',
  '........22223321........',
  '........22223321........',
  '........22223321........',
  '........22223321........',
  '........22223321........',
  '........22223321........',
  '.....222222222222221....',
  '.....222222222222221....',
  '.....111111221111111....',
  '...........221..........',
  '...........221..........',
  '...........221..........',
  '..........2221..........',
  '..........2221..........',
  '..........1111..........',
];
