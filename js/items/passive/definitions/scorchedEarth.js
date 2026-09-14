import { definePassiveItem } from '../shared.js';

// HELLFIRE, OFF THE SLIDE INSTEAD OF OFF THE RELOAD. Same patches, same
// beat, same friendly creep - what changes is what lays them, and a slide is
// a thing with a direction and an end, so the line it leaves is a wall drawn
// across a room rather than a trail that follows the player around.
//
// A build holding both gets both; the patches are on one list with one cap,
// because they are the same object and a slide through your own reload trail
// should not evict it.
export const id = 'scorchedEarth';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'SCORCHED EARTH',
    max: 1,
    theme: THEME.scorchedEarth,
    effects: [['SLIDING LEAVES A', GOOD], ['TRAIL OF FIRE', NOTE]],
    apply: (mods, n) => { mods.slideFire = 0.5 * n; mods.slideFireRadius = 2.2; },
}));
