import { definePassiveItem } from '../shared.js';

// HEIGHT AS A STAT. Every generated arena has boxes, decks and catwalks in
// it and nothing in either pool has ever paid for standing on one - the high
// ground bought sightlines and cost cover, and that was the whole of it.
// Read off the FEET being off the floor rather than off a named piece of
// geometry, so a kerb counts, a crate counts and a stair counts.
export const id = 'tightrope';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'TIGHTROPE',
    max: 1,
    theme: THEME.tightrope,
    effects: [['+25% FIRE RATE', GOOD], ['WHILE AIRBORNE', NOTE]],
    apply: (mods, n) => { mods.highRate = 0.25 * n; },
}));

export const icon = [
  '........................',
  '..........2221..........',
  '.........222221.........',
  '.........222221.........',
  '.........222221.........',
  '.1.......122211.......1.',
  '22221.....1111.....22221',
  '11122221........22221111',
  '...111222222222221111...',
  '......111112221111......',
  '.........1.2211.........',
  '...........221..........',
  '...........221..........',
  '...........221..........',
  '.........222221.........',
  '.........211121.........',
  '.........21..21.........',
  '........221..221........',
  '........211..121........',
  '........21....21........',
  '.......121....211.......',
  '........21....21........',
  '.22222222222222222222222',
  '........................',
];
