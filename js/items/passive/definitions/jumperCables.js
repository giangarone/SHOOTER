import { definePassiveItem } from '../shared.js';

// ---- the item slot ------------------------------------------------------

// BEING HIT PAYS THE BUTTON. Three points a hit against a fifty-point item is
// seventeen hits for a press, which is most of a bad wave - so what it really
// does is guarantee that a fight going badly hands the player the one thing
// that can turn it round, whether or not they killed anything to earn it.
//
// ON A HIT AND NOT ON A TICK. Fire, poison and the lava floor bill through
// _hurtPlayerDot, several times a second, and paying that would make standing
// in a hazard the fastest way to charge an item in the game - a mechanic
// whose optimal play is "do not play". A blow that arrived from something in
// the room is what this counts, at most once per blow.
export const id = 'jumperCables';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'JUMPER CABLES',
    max: 1,
    theme: THEME.jumperCables,
    effects: [['EACH HIT TAKEN:', NOTE], ['+3 ITEM CHARGE', GOOD]],
    apply: (mods, n) => { mods.hitCharge = 3 * n; },
}));
