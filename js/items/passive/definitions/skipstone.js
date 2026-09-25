import { definePassiveItem } from '../shared.js';

// A SHOT THAT SKIPS. The bounce is the whole pick: a round that misses low
// comes off the floor once and carries on, so the ground the player was
// standing on becomes a bank shot rather than a dead end. It bounces ONCE -
// the second touch is the last, exactly as the card says - and it keeps its
// damage, so the bounce is a second chance at the same shot rather than at a
// smaller one.
//
// DRAWS THE SAME CONE the forward shot does not: the bounce leaves along the
// reflected ray with a fresh spread, so a skipped round is not a laser and
// cannot be relied on as one - which is the price of a free second chance.
export const id = 'skipstone';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'SKIPSTONE',
    max: 1,
    theme: 0x4dd0e1,
    effects: [['SHOTS BOUNCE OFF', GOOD], ['THE FLOOR ONCE', NOTE]],
    apply: (mods, n) => { mods.skipstone = n; },
}));

// A STONE MID-SKIP. The flat stone between its arcs, the ripple it left
// behind, and the one it is about to make.
export const icon = [
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '..........4..4..........',
  '.......4........4.......',
  '............3...........',
  '.....4...4....4...4.....',
  '........................',
  '........44422221........',
  '........42433321........',
  '........11111111........',
  '...42221........42221...',
  '....111..........111....',
  '..42221.................',
  '........................',
  '..4.1.1.1.1.1.1.1.1.1...',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
];
