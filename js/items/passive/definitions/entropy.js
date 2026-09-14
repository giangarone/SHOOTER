import { definePassiveItem } from '../shared.js';

export const id = 'entropy';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'ENTROPY',
    max: 1,
    theme: THEME.stone,
    effects: [['STATUS NEVER ENDS', GOOD], ['ON ENEMIES UNDER 30% HP', NOTE]],
    apply: (mods, n) => { mods.entropyBelow = 0.3 * n; },
}));
