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

// THE POT WITH A LADLE IN IT, TWICE. One serving, then another - drawn as
// the casserole dish with the serving spoon standing in it and a second
// helping already lifted out.
export const icon = [
  '........................',
  '.......22222............',
  '......2333332.......22..',
  '.....233333332.....2222.',
  '....23333333332...2222..',
  '....233333333332.2222...',
  '....23333333333332222...',
  '....2333333333333322....',
  '....233333333333332.....',
  '...2233333333333332.....',
  '..22333333333333332.....',
  '.223333333333333332.....',
  '.2333333333333333322....',
  '.2333333333333333322....',
  '.2233333333333333322....',
  '..22333333333333322.....',
  '...2233333333333322.....',
  '....22333333333322......',
  '......22333333322.......',
  '.......2222222222.......',
  '.......2211221122.......',
  '.......2211221122.......',
  '........22222222........',
  '........................',
];
