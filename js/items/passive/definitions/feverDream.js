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
  '...........2............',
  '.........44442..........',
  '.........43332..........',
  '..44442..23322..4442....',
  '..23332...222...43322...',
  '...2222.........2222....',
  '........................',
  '........................',
  '.........22221..........',
  '.......222222221........',
  '......22222222221.......',
  '......22222222221.......',
  '.....2200022200021......',
  '.....2000022000021......',
  '.....2200022000021......',
  '.....2200022200021......',
  '.....2222222222211......',
  '.....122222222221.......',
  '......12222022211.......',
  '.......122222221........',
  '........22222221........',
  '........22222221........',
  '........22222221........',
  '........11111111........',
];
