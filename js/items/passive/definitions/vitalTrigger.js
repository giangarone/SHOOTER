import { definePassiveItem } from '../shared.js';

// The item slot, with a heal stapled to it. It is worth the most to the
// cheapest item in the pool - a 40-point charge fired often is more healing
// than a 90-point one fired twice a run - which is a nice inversion of how
// every other item comparison in the game goes.
export const id = 'vitalTrigger';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'VITAL TRIGGER',
    max: 1,
    theme: 0x64ffda,
    effects: [['USING YOUR ITEM', NOTE], ['ALSO HEALS 5 HP', GOOD]],

    apply: (mods, n) => { mods.itemHeal = 5 * n; },
}));

// THE PLUNGER WITH A HEART. A thumb-press detonator: T-handle and shaft
// up top, a heart set into the housing face, and the pulse it fires below
// it - press the item, and the bar answers.
export const icon = [
  '........................',
  '........................',
  '........43333331........',
  '.........311113.........',
  '...........33...........',
  '...........33...........',
  '..........3333..........',
  '.......4222222221.......',
  '.......4233223321.......',
  '....3..4243333321.......',
  '...343.2233333321.......',
  '....3..2223333221.......',
  '.......2222233221..3....',
  '.......2330403321.343...',
  '.......2223332221..3....',
  '.......2222222221.......',
  '.......2111111111.......',
  '......422222222221......',
  '......111111111111......',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
];
