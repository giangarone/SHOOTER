import { definePassiveItem } from '../shared.js';

// THE LAST ROUND, CASHED. A magazine emptied INTO something reloads itself,
// so a build that counts its shots never stands still - and one that sprays
// the last five into a wall pays the full 1.4 seconds like everybody else.
export const id = 'chainFeed';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'CHAIN FEED',
    max: 1,
    theme: THEME.chainFeed,
    effects: [['KILL WITH THE LAST', NOTE], ['ROUND: INSTANT RELOAD', GOOD]],
    apply: (mods, n) => { mods.chainFeed = n; },
}));
