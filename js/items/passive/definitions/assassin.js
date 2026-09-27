import { definePassiveItem } from '../shared.js';

export const id = 'assassin';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'ASSASSIN',
    max: 1,
    theme: 0x9c27b0,
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

// THE MARKED BLADE. A stiletto sunk to the guard in the thing it opens: a
// polished rim, a dark fuller down the middle, and the guaranteed crit
// flowering under the point.
export const icon = [
  '........................',
  '........................',
  '...........43...........',
  '..........2331...3......',
  '...........41...343.....',
  '...........21....3......',
  '..........1221..........',
  '...........21...........',
  '........42222221........',
  '.........222221.........',
  '..........401...........',
  '..........401...........',
  '..........401...........',
  '..........201...........',
  '..........201...........',
  '..........201...........',
  '..........201...........',
  '..........201...........',
  '...........21...........',
  '...........3............',
  '..........343...........',
  '...........3............',
  '........................',
  '........................',
];
