import { definePassiveItem } from '../shared.js';

export const id = 'terror';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'TERROR',
    max: 1,
    theme: THEME.fear,
    effects: [['HITS MAKE ENEMIES FLEE', GOOD], ['FOR 2s, UNABLE TO ATTACK', NOTE]],
    apply: (mods, n) => { mods.fearTime = 2 * n; },
}));
