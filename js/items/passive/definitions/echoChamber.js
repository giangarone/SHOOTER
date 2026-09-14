import { definePassiveItem } from '../shared.js';

// A FREE ROUND EVERY FOURTH TRIGGER PULL, at half strength and off no
// magazine. Counted per SHOT and not per pellet, the rule every other
// per-shot pick in the pool follows.
export const id = 'echoChamber';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'ECHO CHAMBER',
    max: 1,
    theme: THEME.echoChamber,
    effects: [['EVERY 4th SHOT FIRES', GOOD], ['TWICE, ECHO IS HALF DMG', NOTE], ['AND COSTS NO AMMO', GOOD]],
    apply: (mods, n) => {
      mods.echoEvery = 4;
      mods.echoDamage = 0.5 * n;
    },
}));
