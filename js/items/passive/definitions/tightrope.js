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
