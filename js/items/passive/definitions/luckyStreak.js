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

export const icon = [
  '........................',
  '........................',
  '........................',
  '...........21...........',
  '........22222221........',
  '......224322223321......',
  '.....22222111123221.....',
  '....22211......12221....',
  '....2211........1221....',
  '...2211..........1221...',
  '...431............232...',
  '...431............232...',
  '..1221............1221..',
  '...221.............221..',
  '...221.............221..',
  '...221.............221..',
  '...221.............221..',
  '...431.............431..',
  '...431.............431..',
  '...231.............421..',
  '...111.............111..',
  '........................',
  '........................',
  '........................',
];
