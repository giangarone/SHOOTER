import { definePassiveItem } from '../shared.js';

// ACCURACY, BILLED BOTH WAYS. Hot Streak charges misses in damage; this
// charges them in blood, and pays hits in it. Per SHOT, so a shotgun's nine
// pellets are one hit or one miss - and it can never take the last point,
// for the same reason Cursed Ammo cannot.
export const id = 'aimOrBleed';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'AIM OR BLEED',
    max: 1,
    theme: 0xef5350,
    effects: [['HITS HEAL 1 HP', GOOD], ['MISSES COST 1 HP', BAD], ['NEVER BELOW 1 HP', NOTE]],
    apply: (mods, n) => { mods.aimHeal = 1 * n; mods.missCost = 1 * n; },
}));

export const icon = [
  '........................',
  '............1...........',
  '............1...........',
  '........22222221........',
  '.......2111111121.......',
  '......211...1..121......',
  '.....211........121.....',
  '.....21..........21.....',
  '....211..........121....',
  '....21.....42.....21....',
  '..2221....4432....22221.',
  '..1121....2222....21111.',
  '....121..........211....',
  '.....21..........21.....',
  '.....121........211.....',
  '......121......211......',
  '.......1222222211.......',
  '........11121111........',
  '...........21...........',
  '...........42...........',
  '..........4432..........',
  '..........4332..........',
  '..........2222..........',
  '........................',
];
