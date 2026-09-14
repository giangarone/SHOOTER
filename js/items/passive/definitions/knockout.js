import { definePassiveItem } from '../shared.js';

export const id = 'knockout';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'KNOCKOUT DROPS',
    max: 1,
    theme: THEME.impact,
    effects: [['HITS KNOCK ENEMIES', GOOD], ['BACK 1.5m', NOTE]],
    apply: (mods, n) => { mods.knockback = 1.5 * n; },
}));
