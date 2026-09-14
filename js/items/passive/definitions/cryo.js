import { definePassiveItem } from '../shared.js';

export const id = 'cryo';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'CRYO ROUNDS',
    max: 1,
    theme: THEME.ice,
    effects: [['HITS SLOW ENEMIES 50%', GOOD], ['FOR 3s, THEIR SHOTS TOO', NOTE]],
    apply: (mods, n) => { mods.slowTime = 3 * n; },
}));
