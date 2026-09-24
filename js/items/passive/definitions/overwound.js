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
  '.....................42.',
  '...................4442.',
  '.................442222.',
  '........222221.44222....',
  '......222222222422......',
  '.....221111111221.......',
  '....2211......1221......',
  '...2211........1221.....',
  '..2211.1........1221....',
  '..221.221.....21.221....',
  '..211.211.42.121.121....',
  '..21..21.4432.21..21....',
  '..21..21.4332.21..21....',
  '..21..21.2322.21..21....',
  '..221.121.42.211.221....',
  '..111..22222221..211....',
  '...1...11222111.221.....',
  '.........1111..2211.....',
  '...............211......',
  '...............11.......',
  '........................',
  '........................',
  '........................',
];
