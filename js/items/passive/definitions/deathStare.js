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

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'DEATH STARE',
    max: 1,
    theme: 0xb06bff,
    effects: [
      ['MELEE HITS THAT LAND', NOTE],
      ['PETRIFY THE ATTACKER', GOOD],
      ['FOR 3s', NOTE],
    ],
    apply: (mods, n) => { mods.deathStare = 3 * n; },
}));

// THE ATTACKER, STOPPED. PETRIFY is a chance on a round and this is a
// certainty on a body: the thing that swung at you stands where it swung,
// stoned, for three seconds - which is a damage window the player did not
// have to pay a trigger pull for, and the answer to the rusher the pool has
// otherwise always charged for.
//
// THE EYE ITSELF. A slit-pupilled glare beaming down both sides into the
// two fangs below, already graying with cracks - look, stone, window.
export const icon = [
  '........................',
  '........................',
  '........................',
  '........................',
  '........43333331........',
  '.......4223333221.......',
  '.......3223003221.......',
  '.......3243003221.......',
  '.......3223003221.......',
  '.......2223333221.......',
  '........21111111........',
  '.......3........3.......',
  '......3..........3......',
  '.....4............4.....',
  '....4331........4331....',
  '....4031........4031....',
  '....2031........2031....',
  '.....31.........31......',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
];
