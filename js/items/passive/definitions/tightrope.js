import { definePassiveItem } from '../shared.js';

// HEIGHT AS A STAT. Every generated arena has boxes, decks and catwalks in
// it and nothing in either pool has ever paid for standing on one - the high
// ground bought sightlines and cost cover, and that was the whole of it.
// Read off the FEET being off the floor rather than off a named piece of
// geometry, so a kerb counts, a crate counts and a stair counts.
export const id = 'tightrope';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'TIGHTROPE',
    max: 1,
    theme: 0xffab91,
    effects: [['+25% FIRE RATE', GOOD], ['WHILE AIRBORNE', NOTE]],
    apply: (mods, n) => { mods.highRate = 0.25 * n; },
}));

export const icon = [
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '......4....441....4.....',
  '...........231..........',
  '..4.........2........4..',
  '..2.......2.2........2..',
  '..2..444...42.2......2..',
  '..2....444442........2..',
  '..2.........22444....2..',
  '..2.........2.24444..2..',
  '..2.........2..1.....2..',
  '..2.....3...2........2..',
  '..2.........2........2..',
  '..2.........1........2..',
  '..42222222222222222221..',
  '........................',
  '....1.1.1.1.1.1.1.1.....',
  '........................',
  '........................',
  '........................',
];
