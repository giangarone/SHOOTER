import { definePassiveItem } from '../shared.js';

// The item slot, with a heal stapled to it. It is worth the most to the
// cheapest item in the pool - a 40-point charge fired often is more healing
// than a 90-point one fired twice a run - which is a nice inversion of how
// every other item comparison in the game goes.
export const id = 'vitalTrigger';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'VITAL TRIGGER',
    max: 1,
    theme: THEME.vitalTrigger,
    effects: [['USING YOUR ITEM', NOTE], ['ALSO HEALS 5 HP', GOOD]],

    apply: (mods, n) => { mods.itemHeal = 5 * n; },
}));

export const icon = [
  '........................',
  '........................',
  '...........21...........',
  '.......2222222221.......',
  '......222222222221......',
  '.....22222222222221.....',
  '....2222222333222221....',
  '...222222223332222221...',
  '...222222223332222221...',
  '..22222222233322222221..',
  '..22222333333333332221..',
  '..22222333333333332221..',
  '..22222333333333332221..',
  '..22222333333333332221..',
  '..22222222233322222221..',
  '..12222222233322222211..',
  '...222222223332222221...',
  '...122222223332222211...',
  '....2222222222222221....',
  '....1122222222222111....',
  '......122222222211......',
  '.......1112221111.......',
  '..........1111..........',
  '........................',
];
