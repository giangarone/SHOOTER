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

// A STONE MID-SKIP. The classic three-hop: two ripples behind, the stone
// between them, the whole drawing reading as one object crossing water.
export const icon = [
  '........................',
  '........................',
  '........................',
  '...........2222.........',
  '..........233332........',
  '.........23333332.......',
  '........233333332.......',
  '.........23333332.......',
  '..........2333322.......',
  '.......22222332222......',
  '......2333333333332.....',
  '.....233322222233322....',
  '....233322....2233322...',
  '...233322......2233322..',
  '...2332..........23332..',
  '....22.............22...',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
];
