import { definePassiveItem } from '../shared.js';

// NOTHING IS WASTED ON A CORPSE. A rifle round worth 34 into a body with 5
// left used to throw 29 away; now it walks. Five metres, so it pays a player
// shooting into a crowd and pays nothing at all to one picking off stragglers.
export const id = 'overkill';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'OVERKILL',
    max: 1,
    theme: THEME.overkill,
    effects: [['EXCESS KILL DAMAGE', NOTE], ['CARRIES TO THE NEXT', GOOD], ['ENEMY IT CAN REACH', NOTE]],
    apply: (mods, n) => { mods.overkill = n; mods.overkillRange = 5; },
}));
