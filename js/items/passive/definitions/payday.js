import { definePassiveItem } from '../shared.js';

// ---- AMMUNITION AND MONEY ------------------------------------------------

// A FLAT HUNDRED A BODY, which is worth more early than Midas and less late -
// it does not scale with the enemy, so it pays a wave of chaff and shrugs at
// a boss. The damage is what it charges, and it charges it on every source.
export const id = 'payday';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'PAYDAY',
    max: 1,
    theme: 0xffca00,
    effects: [['+$100 PER KILL', GOOD], ['DAMAGE -10%', BAD]],
    apply: (mods, n) => {
      mods.killCredits = 100 * n;
      mods.damage *= Math.pow(0.9, n);
    },
}));

export const icon = [
  '........................',
  '........................',
  '........................',
  '........22222221........',
  '........22222221........',
  '........22222221........',
  '........22222221........',
  '.......2222222221.......',
  '.......00000000000......',
  '......200000000000......',
  '.....22000033000001.....',
  '.....22222233222221.....',
  '....2222223333222221....',
  '....22222333322222221...',
  '....22222333322222221...',
  '....22222223322222221...',
  '....22222223322222221...',
  '....22222223333222221...',
  '....22222233333222221...',
  '....22222233332222221...',
  '....22222223322222221...',
  '....22222222222222221...',
  '....11111111111111111...',
  '........................',
];
