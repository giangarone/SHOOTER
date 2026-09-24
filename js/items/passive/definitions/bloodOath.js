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

export const icon = [
  '...................2....',
  '..................442...',
  '.................422322.',
  '................422.22..',
  '...............422..2...',
  '......2221...2442.......',
  '.....2222222243321......',
  '....22222222333221......',
  '....222222233322221.....',
  '....222222333222221.....',
  '....222223332222221.....',
  '....222233322222211.....',
  '....12233322222211......',
  '.....233322222211.......',
  '.....43322222221........',
  '.....22222222211........',
  '.......12222221.........',
  '........1222112.........',
  '.........2221.2.........',
  '........42111222........',
  '........42.1..2.........',
  '........22..............',
  '........................',
  '........................',
];
