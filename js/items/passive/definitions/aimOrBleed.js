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
  '........................',
  '............2...........',
  '.........222222.........',
  '.......2442222242.......',
  '......222332233222......',
  '......223333333321......',
  '....2233033330332221....',
  '....2233333003333221....',
  '....2223333003332221....',
  '....2222333033322221....',
  '......222330333211......',
  '.......2222222211.......',
  '.........222221.........',
  '...........21...........',
  '..........33..3.........',
  '..........32..3.........',
  '..........3.............',
  '.............4..........',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
];
