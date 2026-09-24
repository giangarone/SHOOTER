import { definePassiveItem } from '../shared.js';

export const id = 'devilsGamble';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: "DEVIL'S GAMBLE",
    max: 1,
    theme: THEME.gamble,
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

export const icon = [
  '........................',
  '........................',
  '........................',
  '...22222222222222221....',
  '...22222222222222221....',
  '...222332222222332221...',
  '...223333222223333221...',
  '...223333222223333221...',
  '...222332222222332221...',
  '...222222222222222221...',
  '...222222233322222221...',
  '...222222233322222221...',
  '...222222233322222221...',
  '...222222222222222221...',
  '...222332222222332221...',
  '...223333222223333221...',
  '...223333222223333221...',
  '...222332222222332211...',
  '...22222222222222221....',
  '...11222222222222111....',
  '.....1111111111111......',
  '........................',
  '........................',
  '........................',
];
