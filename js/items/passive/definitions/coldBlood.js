import { definePassiveItem } from '../shared.js';

// ---- staying alive ------------------------------------------------------

// ARMOUR THAT ONLY EXISTS WHERE IT MATTERS. BERSERKER pays damage for a low
// bar and this pays survival for it, and the two are meant to be found
// together: the quarter of the bar that used to be the part a run died in is
// the part it now fights hardest in.
//
// A HARD LINE AND NOT A RAMP, unlike BERSERKER - it is a place on the bar the
// player can see themselves crossing, and a ramp would make the best moment
// of the pick invisible.
export const id = 'coldBlood';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'COLD BLOOD',
    max: 1,
    theme: 0x5c8dc7,
    effects: [['TAKE 30% LESS DAMAGE', GOOD], ['BELOW 25% HEALTH', NOTE]],
    apply: (mods, n) => { mods.coldBloodAt = 0.25; mods.coldBloodCut = 0.3 * n; },
}));

export const icon = [
  '........................',
  '........................',
  '........................',
  '.......21......21.......',
  '.....222221..222221.....',
  '....2222222222222221....',
  '....2222222222222221....',
  '...222222222222222221...',
  '...222222222222222221...',
  '...222222222222222221...',
  '...122222222222222211...',
  '....1222222222222211....',
  '.....12222222222211.....',
  '......222222222221......',
  '......200220022001......',
  '......4003300330032.....',
  '......2233333332222.....',
  '........23333322........',
  '.........233322.........',
  '..........2322..........',
  '...........22...........',
  '........................',
  '........................',
  '........................',
];
