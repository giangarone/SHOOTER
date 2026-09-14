import { definePassiveItem } from '../shared.js';

// WHITE CELL, AS A PASSIVE ITEM, PAID FOR BY THE HEAL. Every affliction in
// status.js comes off - the burn, the poison, the chill, fear, weakness and
// the curse - and what it costs is the health the player had to spend
// anyway, which is why it is worth most to exactly the builds that are
// already healing and nothing at all to one that never does.
//
// A WHOLE POINT OF HEALING, AND THE THRESHOLD IS THE ENTIRE PICK. Most
// healing in this game arrives as a rate times dt - NANOWEAVE's trickle, DIG
// IN's, SLOW RELEASE's drip, HEALTHY CORE's - and a cleanse that fired on a
// hundredth of a point would not be a cleanse at all, it would be IRON LUNG:
// nothing could ever land on a run carrying any regeneration. So what it
// tests for is a heal the player can SEE arriving, and a trickle stays a
// trickle. See Player.heal.
export const id = 'sterileField';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'STERILE FIELD',
    max: 1,
    theme: THEME.sterileField,
    effects: [['ANY HEAL ALSO CLEARS', NOTE], ['STATUS EFFECTS ON YOU', GOOD]],
    apply: (mods, n) => { mods.sterileField = n; },
}));
