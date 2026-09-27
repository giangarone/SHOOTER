import { definePassiveItem } from '../shared.js';

export const id = 'packRat';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'PACK RAT',
    max: 1,
    theme: 0xbaaaa4,
    // THE WALK IT ANSWERS: the ammo crate ten metres the wrong side of the
    // fight, dropped by a kill you made while retreating. The rat makes that
    // walk so you do not, one plate at a time - and it never collects
    // anything: the plate rides its back and is the player's to pick up,
    // before, during or after the haul (see Porter in js/companions.js).
    effects: [['A PET RAT FETCHES', GOOD], ['AMMO CRATES TO', GOOD], ['YOUR FEET', NOTE]],
    apply: (mods, n) => { mods.packRat = n; },
}));

// Side profile, facing right under its errand: the strapped crate on the
// back, the big round ear over the bead eye, the pointed snout, the pale
// belly, four quick feet and the long bare tail dragging behind.
export const icon = [
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '......222222............',
  '......422222............',
  '......220222............',
  '......333333.222........',
  '......222222.244........',
  '......211111.22222......',
  '.............2202244....',
  '............1222221.....',
  '....4222222222221.......',
  '..33.2222222222221......',
  '..33.222222222221.......',
  '..31224444422221........',
  '..3.122.122.111.........',
  '.3..112..112.1..........',
  '.31.....................',
  '........................',
  '........................',
  '........................',
  '........................',
];