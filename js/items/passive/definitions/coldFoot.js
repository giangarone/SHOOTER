import { definePassiveItem } from '../shared.js';

// SCORCHED EARTH, IN ICE, AND OFF THE SPRINT RATHER THAN THE SLIDE. That is
// the difference worth stating: a slide is a second and a direction, so what
// it leaves is a WALL; a sprint is however long the bar lasts and wherever
// the player goes, so what this leaves is a floor they can draw on.
//
// IT SLOWS AND DOES NOT BURN. There is already one thing the player runs
// around laying down that deals damage, and a second would just be a worse
// version of it. A slow is what running away is actually for: the ice goes
// down BETWEEN the player and whatever is chasing them, which is the only
// pick in the pool that rewards breaking off.
//
// FRIENDLY CREEP, exactly like ash and the reload trail: standing in your own
// ice has to be visibly safe, or a player will simply never sprint.
export const id = 'coldFoot';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'COLD FOOT',
    max: 1,
    theme: THEME.coldFoot,
    effects: [['SPRINTING LAYS DOWN ICE', GOOD], ['THAT SLOWS PURSUERS', NOTE]],
    apply: (mods, n) => { mods.coldFoot = 1.6 * n; mods.coldFootRadius = 2.2; },
}));
