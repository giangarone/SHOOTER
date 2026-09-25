import { definePassiveItem } from '../shared.js';

// Rate bought with the one thing a faster gun needs more of. A 1.4s reload
// becomes 2s, which is most of a second longer every thirty rounds - and the
// rate is spending those rounds faster, so the pick pays for itself twice
// and charges for itself twice.
export const id = 'overwound';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'OVERWOUND',
    max: 1,
    theme: 0xe65100,
    effects: [['+40% FIRE RATE', GOOD], ['RELOADS 30% SLOWER', BAD]],
    apply: (mods, n) => {
      mods.fireRate *= 1 + 0.4 * n;
      mods.reloadMult *= Math.pow(1 / 0.7, n);
    },
}));

export const icon = [
  '........................',
  '........................',
  '........................',
  '....4...................',
  '........................',
  '....4444234444..........',
  '....1111231111..........',
  '..42....23........44221.',
  '..224444234444....20001.',
  '..221111231111....20001.',
  '..22....23....422220001.',
  '..224444234444111120001.',
  '..221111231111.2.220001.',
  '..22....23.....4.421111.',
  '..224444234444..........',
  '....1111231111..........',
  '........23..............',
  '........................',
  '................4.......',
  '..................4.....',
  '........................',
  '........................',
  '........................',
  '........................',
];
