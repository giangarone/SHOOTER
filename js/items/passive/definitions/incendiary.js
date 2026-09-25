import { definePassiveItem } from '../shared.js';

export const id = 'incendiary';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'INCENDIARY',
    max: 1,
    theme: 0xff5a00,
    // Twice a beat where poison is once: fire is the fierce, short one and
    // poison the patient one, and on the beat that difference is audible.
    effects: [
      ['SHOTS SET ENEMIES', GOOD],
      ['10 DAMAGE PER TICK, 3s', NOTE],
      ['FIRE SPREADS ON DEATH', NOTE],
    ],
    apply: (mods, n) => {
      mods.burnPower = 1 * n;
      mods.burnTime = 3 * n;
      mods.burnSpread = 3 * n;
    },
}));

export const icon = [
  '........................',
  '........................',
  '............2...........',
  '...........222..........',
  '..........42222.........',
  '..........23332.........',
  '.........4233322........',
  '.........2333332........',
  '........223343322.......',
  '........223422322.......',
  '........233222332.......',
  '.......44442222111......',
  '.......22332023322......',
  '.......22332023322......',
  '.......22232223222......',
  '.......22232223222......',
  '........222333222.......',
  '........222222222.......',
  '.......11111111111......',
  '........21111111........',
  '........................',
  '........................',
  '........................',
  '........................',
];
