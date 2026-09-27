import { definePassiveItem } from '../shared.js';

// DOUBLE DAMAGE, PAID FOR IN BAR, FOREVER. Five max HP a wave is nothing on
// wave two and the whole run by wave twenty - and it stops at fifty, which is
// the number that keeps it a build rather than a countdown. Anything that
// raises the cap back over fifty starts the meter again, which is the honest
// reading of the deal: the oath is on the max, not on a wave count.
export const id = 'bloodOath';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'BLOOD OATH',
    max: 1,
    theme: 0x9b1b30,
    effects: [['+100% DAMAGE', GOOD], ['-5 MAX HP PER WAVE', BAD], ['FLOORS AT 50 MAX HP', NOTE]],
    apply: (mods, n) => { mods.oathPerWave = 5 * n; mods.oathFloor = 50; },
}));

// SWORN ON A HEART. The athame goes in past the quillons and stays there:
// blade, wound and host in one silhouette, welling where the steel went.
export const icon = [
  '........................',
  '........................',
  '..........4221..........',
  '..........2221..........',
  '...........21...........',
  '...........21...........',
  '...........21...........',
  '........2......1........',
  '........42222221........',
  '...........41...........',
  '........42220221........',
  '.......4222202221.......',
  '......42223133221.......',
  '......2222300032221.....',
  '.......2230222221.......',
  '.......2232222221.......',
  '........21222221........',
  '.........222221.........',
  '..........2221..........',
  '...........21...........',
  '...........1............',
  '........................',
  '........................',
  '........................',
];
