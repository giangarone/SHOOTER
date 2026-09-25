import { definePassiveItem } from '../shared.js';

// THREE TIMES THE CRATES, HALF THE PLATE. The trade is deliberately not a
// wash: 3 x 0.5 is 1.5x the healing per kill on average, so the pick is worth
// taking on its own - but the SLOW RELEASE and overheal ceilings are paid in
// whole crates, so the run has to walk over more of the floor to collect the
// same bar back. What it actually buys is RELIABILITY: three rolls at a
// quarter-chance is a crate nearly every other kill rather than one in six.
//
// ON THE DROP'S ODDS, NOT ITS SIZE. `chance` is what the pickup IS (see
// AMMO SURPLUS's note for the whole argument); what a pick changes is what
// walking over one is worth, and what this one changes is how often there is
// one to walk over.
export const id = 'secondHelpings';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'SECOND HELPINGS',
    max: 1,
    theme: 0xffe0b2,
    effects: [['3x THE HEALTH CRATES,', GOOD], ['EACH HEALS HALF', BAD]],
    apply: (mods, n) => {
      mods.crateLuck = 1 + 3 * n;
      mods.crateHealMult = 1 - 0.5 * n;
    },
}));

// THE POT WITH A LADLE IN IT, AND THE SECOND BOWL BESIDE IT. One serving
// in the pot, the ladle still standing in it, and the helping already lifted.
export const icon = [
  '........................',
  '........................',
  '........................',
  '...........4.4..........',
  '..........4...24.4......',
  '.........4....42........',
  '...............2........',
  '...............22.......',
  '.......4444444442.......',
  '........2433332..1......',
  '........2222222.........',
  '........2222222.22222...',
  '.................332....',
  '.................222....',
  '....4444444444444.......',
  '.....24333333331........',
  '.....22222222221........',
  '.....22222222221........',
  '......111111111.........',
  '........1.....1.........',
  '........................',
  '........................',
  '........................',
  '........................',
];
