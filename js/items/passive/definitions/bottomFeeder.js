import { definePassiveItem } from '../shared.js';

// DAMAGE OFF AN EMPTY GUN. The only pick in the pool that pays for running
// dry, which is the one thing every other ammunition pick in the game is
// trying to stop the player doing.
export const id = 'bottomFeeder';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'BOTTOM FEEDER',
    max: 1,
    theme: THEME.bottomFeeder,
    effects: [['RELOAD ON AN EMPTY', NOTE], ['MAG: +20% DMG FOR 5s', GOOD]],
    apply: (mods, n) => { mods.bottomFeed = 0.2 * n; mods.bottomTime = 5; },
}));
