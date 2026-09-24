import { definePassiveItem } from '../shared.js';

// THE GRAZE DOES NOT EXIST. Ten points and under, the hit simply never
// lands - not reduced, not absorbed, IGNORED. The line is deliberately
// generous: most of the chaff a wave throws (splitter children, drifting
// embers, a graze off a passing mortar) sits well under ten, so the pick is
// a whole category of noise switched off rather than a percentage.
//
// ABOVE THE SHIELD, on CERAMIC INSERT's terms and for its reason: the card
// says ignored, and a graze paid for out of a shield point would be a shield
// the player lost to a fly. The line is measured against the blow AFTER
// every multiplier - the "10 damage" on the card is what arrives.
export const id = 'glancingBlow';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'GLANCING BLOW',
    max: 1,
    theme: 0xb2ebf2,
    effects: [['HITS OF 10 DAMAGE', NOTE], ['OR LESS ARE IGNORED', GOOD]],
    apply: (mods, n) => { mods.glancingBlow = 10 * n; },
}));

// A SHOT ARRIVING OFF-ANGLE. The deflected round - a bullet path bending
// away at the last moment, the one drawing that says "did not land".
export const icon = [
  '........................',
  '........................',
  '33......................',
  '333.....................',
  '.333....................',
  '..333...................',
  '...3333.................',
  '....3333................',
  '.....3333...............',
  '......33333.............',
  '.......333332...........',
  '........3333322.........',
  '.........3333322........',
  '..........4333322.......',
  '...........4433322......',
  '..........44443322......',
  '.........444333322......',
  '........4443333222......',
  '.......4433332222.......',
  '......443332222.........',
  '.....44332222...........',
  '....4433222.............',
  '........................',
  '........................',
];
