import { definePassiveItem } from '../shared.js';

// THE ROUND NOBODY EVER WANTED. The last one in a magazine is the one that
// starts a reload, so it has always been the worst shot in the game to be
// holding; this makes it the best. Three times damage, thrown as a blast at
// wherever it stopped, so it is worth firing into a crowd rather than saved.
//
// A BLAST AND NOT A MULTIPLIER, on BREACH ROUND's terms and for its reason:
// what the player gets back for having run the magazine dry should be worth
// something to the ROOM, not just to whatever one body the round landed on.
//
// IT GOES OFF WHEREVER THE SHOT STOPPED, a wall included. The round was spent
// either way, and a version that only paid on a hit would be a pick that
// punished the miss twice.
export const id = 'pocketGrenade';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'POCKET GRENADE',
    max: 1,
    theme: THEME.pocketGrenade,
    effects: [['LAST ROUND OF EACH', NOTE], ['MAG: 3x DAMAGE BLAST', GOOD]],
    apply: (mods, n) => { mods.pocketGrenade = 3 * n; mods.pocketRadius = 4; },
}));
