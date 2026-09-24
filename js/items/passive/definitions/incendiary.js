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
  '...........1............',
  '...........21...........',
  '..........2221..........',
  '.........222221.........',
  '.........2222221........',
  '........222222221.......',
  '........222222221.......',
  '.......22222222211......',
  '.......2223222211.......',
  '......2222332221........',
  '......2223332211........',
  '.....2222333321.........',
  '....2222233332222.......',
  '....2222333322232.......',
  '....222333332223321.....',
  '...22223333332333221....',
  '...22223333333333321....',
  '...222233333333333221...',
  '...222233333332332221...',
  '...111223333322221111...',
  '......122232222211......',
  '.......2222222221.......',
  '.......1111111111.......',
];
