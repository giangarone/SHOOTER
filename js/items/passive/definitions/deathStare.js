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
