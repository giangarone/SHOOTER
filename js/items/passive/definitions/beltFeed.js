import { definePassiveItem } from '../shared.js';

export const id = 'beltFeed';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'BELT FEED',
    max: 3,
    theme: THEME.feed,
    effects: (n) => [
      [step(n, pctUp(10)) + ' OF SHOTS', GOOD],
      ['DRAW FROM THE RESERVE', NOTE],
      ['SO YOU RELOAD LESS', NOTE],
    ],
    apply: (mods, n) => { mods.beltFeed = 0.1 * n; },
}));
