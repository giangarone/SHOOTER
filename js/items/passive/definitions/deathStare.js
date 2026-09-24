import { definePassiveItem } from '../shared.js';

// THE ATTACKER, STOPPED. PETRIFY is a chance on a round and this is a
// certainty on a body: the thing that swung at you stands where it swung,
// stoned, for three seconds - which is a damage window the player did not
// have to pay a trigger pull for, and the answer to the rusher the pool has
// otherwise always charged for.
//
// IT PAYS ON THE HIT LANDING, not on the swing starting: a blow the ward ate
// or the dodge evaded never reached the player, and an attacker that got
// away with it is the one case where the pick would read as broken.
export const id = 'deathStare';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'DEATH STARE',
    max: 1,
    theme: THEME.deathStare,
    effects: [
      ['MELEE HITS THAT LAND', NOTE],
      ['PETRIFY THE ATTACKER', GOOD],
      ['FOR 3s', NOTE],
    ],
    apply: (mods, n) => { mods.deathStare = 3 * n; },
}));

export const icon = [
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '.......22222222221......',
  '.......42222222221......',
  '.......42222222221......',
  '.......43222222221......',
  '.......23322222221......',
  '.......23322223321......',
  '.......22333333221......',
  '.......22333222221......',
  '.......22222222221......',
  '.......22222222221......',
  '.......22222222221......',
  '.......22211111111......',
  '.......2221.............',
  '.......2221.............',
  '.......1111.............',
  '........................',
  '........................',
  '........................',
  '........................',
];
