import { definePassiveItem } from '../shared.js';

// THREE FREE MISTAKES A WAVE, not one. At one it was a pick that mattered for
// the first contact of a wave and then sat dead for the ninety seconds that
// decided the run - a passive item the player stopped owning the moment it
// paid out. Three is a real allowance: it survives an opening the player
// misread, and it still runs out inside a wave that is going badly, which is
// the only reason it is worth taking rather than counting on.
//
// THEY DO NOT BANK. armWard SETS the count at every wave start, so a clean
// wave hands the next one three and not six - see Player.armWard.
export const id = 'holyMantle';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'HOLY MANTLE',
    max: 1,
    theme: 0xfff2b0,
    effects: [['FIRST 3 HITS EACH WAVE', GOOD], ['DEAL NO DAMAGE', NOTE]],
    apply: (mods, n) => { mods.wardPerWave = 3 * n; },
}));

export const icon = [
  '........................',
  '........................',
  '........................',
  '.........444444.........',
  '........43222124........',
  '........................',
  '.......4444444444.......',
  '......222222222222......',
  '.....42222233222221.....',
  '.....42222141122221.....',
  '.....42222122122221.....',
  '.....42224142142221.....',
  '.....42223132132221.....',
  '.....42222122122221.....',
  '.....42222122122221.....',
  '.....42222122122221.....',
  '.....42222122122221.....',
  '.....42122242221221.....',
  '.....11111111111111.....',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
];
