import { definePassiveItem } from '../shared.js';

export const id = 'glassCannon';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'GLASS CANNON',
    max: 1,
    theme: 0xcfe8ff,
    effects: [['+70% DAMAGE', GOOD], ['-50% MAX HEALTH', BAD]],
    apply: (mods, n) => {
      mods.damage *= 1 + 0.7 * n;
      mods.maxHpMult *= Math.pow(0.5, n);
    },
}));

// ALL MUZZLE, NO WALL. A cracked glass barrel with its shine, a starburst
// doing all the talking at the muzzle, and the little cracked heart underneath
// that is paying for every round of it.
export const icon = [
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '................333.....',
  '..............3343333...',
  '.............334444333..',
  '..42222222222344444333..',
  '..42022242222334443322..',
  '..22002224222333433221..',
  '..21111111111333332222..',
  '..............33433.....',
  '.....3223.......3.......',
  '.....3431...............',
  '.....2031...............',
  '......3.................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
];
