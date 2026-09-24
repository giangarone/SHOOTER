import { definePassiveItem } from '../shared.js';

// ONE BODY, HIT AND HIT AND HIT. It is Telltale's rhythm turned into a ramp
// and it asks for the hardest thing in the game: staying on one target while
// the room moves. Switching targets is what breaks it, not missing alone.
export const id = 'luckyStreak';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'LUCKY STREAK',
    max: 1,
    theme: 0xff5c8a,
    effects: [['+5% CRIT CHANCE PER HIT', GOOD], ['ON THE SAME ENEMY', NOTE], ['MISS OR SWITCH: RESET', BAD]],
    apply: (mods, n) => { mods.luckyStep = 0.05 * n; },
}));

// ONE BODY, HIT AND HIT AND HIT. It is Telltale's rhythm turned into a ramp
// and it asks for the hardest thing in the game: staying on one target while
// the room moves. Switching targets is what breaks it, not missing alone.
export const icon = [
  '........................',
  '........................',
  '........................',
  '........................',
  '...........44...........',
  '..........3443..........',
  '..........3333..........',
  '.........433331.........',
  '........34333343........',
  '........34333313........',
  '.......3443333313.......',
  '........42222221........',
  '......3.24433331.3......',
  '........42222221........',
  '........22443221........',
  '.........211111.........',
  '.........111111.........',
  '.................303....',
  '..................0.....',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
];
