import { definePassiveItem } from '../shared.js';

// ---- damage, and what it is measured against ----------------------------

// BEING POISONED IS NOW SOMETHING TO WANT. It is STATUS CONDUIT's idea taken
// one step further: that pick makes a status on the player into a weapon
// against the room, and this makes it into the gun. Poison is the LONG
// status - eight seconds, four a second - so the window is a real stretch of
// a fight rather than a flash, and every theme with a poisoner in it becomes
// a theme that arms you.
export const id = 'feverDream';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'FEVER DREAM',
    max: 1,
    theme: 0x64dd17,
    effects: [['+100% DAMAGE', GOOD], ['WHILE POISONED', NOTE]],
    apply: (mods, n) => { mods.feverDream = 1.0 * n; },
}));

export const icon = [
  '........................',
  '........................',
  '.........4......4.......',
  '..........4....4........',
  '.........44221..4.......',
  '..........4221...44.....',
  '..........4431...1......',
  '..........4331..4.......',
  '....442...4331..........',
  '.....2....4331...442....',
  '..........4331....2.....',
  '..........4331..........',
  '..........4331..........',
  '..........4331..........',
  '....432...4331....432...',
  '.....2....4331.....2....',
  '.........242222.........',
  '........24333221........',
  '........22233212........',
  '.........223221.........',
  '..........2221..........',
  '........................',
  '........................',
  '........................',
];
