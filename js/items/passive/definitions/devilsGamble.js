import { definePassiveItem } from '../shared.js';

export const id = 'devilsGamble';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: "DEVIL'S GAMBLE",
    max: 1,
    theme: 0xff5252,
    // Rolled once per SHOT, not per pellet: a shotgun whose nine pellets each
    // rolled their own coin would average out to nothing, and the whole point
    // is that a shot is either a windfall or a waste.
    //
    // THE NAME IS THE MECHANIC, not a leftover: it is a coin toss with the
    // odds barely in your favour, which is exactly what the phrase means.
    // Renaming a passive item players already know would cost more than it
    // could possibly buy.
    effects: [['51% OF SHOTS: 2x DMG', GOOD], ['49% OF SHOTS: HALF DMG', BAD]],
    apply: (mods, n) => { mods.gamble = n; },
}));

// THE HOUSE COIN, MID-FLIP. Horns out of the rim, eyes lit, grin showing
// fang - it lands how it likes, and it is always still spinning.
export const icon = [
  '........................',
  '........................',
  '........................',
  '........4......4........',
  '........3......3........',
  '.........422321.........',
  '.......4222222221.......',
  '......422222222221.3....',
  '.....42222222222221.....',
  '.....42211122211121.....',
  '.....42200222200221..3..',
  '.....42222222222221.....',
  '.....42222211222221.....',
  '.....42220222202221..4..',
  '.....42222040022221.....',
  '.....42222222222221.....',
  '.....422222222222213....',
  '......222222222221......',
  '........12222221........',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
];
