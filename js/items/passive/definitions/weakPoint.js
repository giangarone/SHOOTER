import { definePassiveItem } from '../shared.js';

// TELLTALE'S PATIENT COUSIN. That one turns the third hit on a body into a
// crit; this one turns the body itself into a soft target, permanently, for
// everything - the gun, a turret, poison, a blast, another enemy's friendly
// fire. Three hits is one burst.
export const id = 'weakPoint';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'WEAK POINT',
    max: 1,
    theme: 0xff4fa3,
    effects: [
      ['3 HITS ON AN ENEMY', GOOD],
      ['MARK IT: +50% DMG TAKEN', NOTE],
      ['FROM ALL SOURCES', NOTE],
    ],
    apply: (mods, n) => { mods.markHits = 3; mods.markBonus = 0.5 * n; },
}));

// THE CRACKED BULLSEYE. A ranged target with a fissure running through
// its energy core, crosshair ticks on every side, and the three pips
// below that mark the body soft for everything.
export const icon = [
  '........................',
  '...........43...........',
  '...........33...........',
  '...........33...........',
  '.........433331.........',
  '.......4322222231.......',
  '......432222222231......',
  '.....43222222222231.....',
  '.....42233333333221.....',
  '.....42232220223221.....',
  '.....42232303323221.....',
  '..33442232303323221331..',
  '.....42230033323221.....',
  '.....42232022223221.....',
  '.....42233333333221.....',
  '.....22222243322221.....',
  '.....22222222222221.....',
  '......222222222221......',
  '.......2222222221.......',
  '.........221111.........',
  '...........33...........',
  '...........11...........',
  '........................',
  '........................',
];
