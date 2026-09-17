import { definePassiveItem } from '../shared.js';

// BEING AFFLICTED IS NOW A WEAPON. STATUS CONDUIT makes a status on the
// player reach the bodies standing near them; this puts it on the AMMUNITION,
// so what the room did to you goes back out at whatever you are aiming at -
// which is a longer reach, a chosen target, and it costs a shot rather than
// a radius.
//
// ONLY WHAT AN ENEMY CAN CARRY. Burning, poison, the chill and fear all exist
// on both sides of the fight and are passed straight through; weakness and
// the curse exist only on the player (see status.js) and are simply not
// transferable - there is nothing on an enemy for them to become, and
// inventing one would be a second meaning for a word the player already
// knows.
//
// THE POWER IS THE FLAT TICK, like every other damage-over-time in the game
// (BURN_TICK and POISON_TICK in enemies/shared.js) - so a poison the player
// is carrying comes off an enemy at the rate every poison does, not at the
// rate whatever poisoned them does.
export const id = 'splashback';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'SPLASHBACK',
    max: 1,
    theme: THEME.splashback,
    effects: [['YOUR SHOTS ALSO APPLY', GOOD], ['STATUS EFFECTS YOU CARRY', NOTE]],
    apply: (mods, n) => { mods.splashback = n; },
}));
