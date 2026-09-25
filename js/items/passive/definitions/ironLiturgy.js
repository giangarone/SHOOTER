import { definePassiveItem } from '../shared.js';

// ---- the crit family, three more ----------------------------------------

// CHEEKWELD'S TRADE, POINTED OUTWARD. That pick buys armour down the sights
// and this buys crit, off the same `aiming` flag and for the same reason -
// the player is paid for the DECISION, not for the weapon finishing its
// raise. +25% on a 5% base is a sixfold crit rate for as long as the sights
// are up, which is the largest single step the crit family has.
export const id = 'ironLiturgy';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'IRON LITURGY',
    max: 1,
    theme: 0xd16ba5,
    effects: [['+25% CRIT CHANCE', GOOD], ['WHILE AIMING', NOTE]],
    apply: (mods, n) => { mods.aimCrit = 0.25 * n; },
}));

// THE AIMED EYE, UNDER CANDLELIGHT. The sights are up - crosshair ticks on
// all four sides - and the liturgy burns above it: halo and two flames.
export const icon = [
  '........................',
  '........................',
  '.......4444444444.......',
  '......4..........4......',
  '........4......4........',
  '........3..44..3........',
  '.......232.22.232.......',
  '........2......2........',
  '........1......1........',
  '........22222222........',
  '.....4444444332221......',
  '..42.44442300321111111..',
  '......42223311211111....',
  '........22222222........',
  '........11111111........',
  '........................',
  '...........11...........',
  '...........11...........',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
];
