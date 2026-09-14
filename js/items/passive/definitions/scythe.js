import { definePassiveItem } from '../shared.js';

// THE SWING STOPS BEING ONE COMMITTED STRIKE. Everything in the arc takes the
// full number the primary target took - not a share of it, which is what
// separates this from SHARED PAIN - so the answer to being surrounded is a
// thing the player can walk INTO rather than away from.
//
// THE ARC, AND NOT THE ROOM. EVERYONE FELT THAT is the item that hits
// everything alive wherever it is standing, and a passive item that did the
// same would make that one a worse version of this. What this sells is a
// DIRECTION: the sixty degrees the swing was already tested against, at the
// reach the swing already has - so LONG ARM makes it a bigger sweep, which is
// the second pair in this block worth assembling.
//
// EVERY BODY IN IT IS A MELEE KILL. The double bounty and BLOODSPORT's heal
// are both worked out from that flag, and a body taken down by the butt of
// the gun is a melee kill wherever in the arc it was standing.
export const id = 'scythe';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'SCYTHE',
    max: 1,
    theme: THEME.scythe,
    effects: [['MELEE HITS EVERY', GOOD], ['ENEMY IN FRONT OF YOU', NOTE]],
    apply: (mods, n) => { mods.scythe = n; },
}));
