import { definePassiveItem } from '../shared.js';

// ONE BLOW, SPLIT EVERY WAY. It is a crowd-clearing pick wearing a drawback:
// against a lone boss it changes nothing at all, and against thirty bodies it
// turns a rifle into a room-wide tick that kills the whole wave at once.
// Every source, so poison, turrets, blasts and lightning are all in it.
export const id = 'sharedPain';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'SHARED PAIN',
    max: 1,
    theme: THEME.sharedPain,
    effects: [['EVERY HIT SPLITS ITS', GOOD], ['DAMAGE EVENLY ACROSS', NOTE], ['ALL ENEMIES', NOTE]],
    apply: (mods, n) => { mods.sharedPain = n; },
}));
