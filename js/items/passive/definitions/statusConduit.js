import { definePassiveItem } from '../shared.js';

// WHATEVER IS ON YOU IS ON THEM. It is the only pick in either pool that
// makes being burnt, poisoned or chilled into a thing worth having - a player
// standing in the lava is now a lit fuse walking through the crowd.
export const id = 'statusConduit';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'STATUS CONDUIT',
    max: 1,
    theme: THEME.statusConduit,
    effects: [['STATUS EFFECTS ON YOU', GOOD], ['SPREAD TO ENEMIES', NOTE], ['WITHIN 5m', NOTE]],
    apply: (mods, n) => { mods.conduit = 5 * n; },
}));
