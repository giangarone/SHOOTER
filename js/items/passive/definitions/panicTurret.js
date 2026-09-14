import { definePassiveItem } from '../shared.js';

// ---- WHAT HAPPENS AROUND YOU --------------------------------------------

// LITTLE BROTHER, INVOLUNTARILY. It is the item's own turret, thrown by
// being hit rather than by a button, and the cap is what stops a bad wave
// from filling the arena: five at once, ten seconds each.
export const id = 'panicTurret';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'PANIC TURRET',
    max: 1,
    theme: THEME.panicTurret,
    effects: [['TAKING A HIT DROPS', GOOD], ['A TURRET, 10s, MAX 5', NOTE]],
    apply: (mods, n) => { mods.panicTurret = n; mods.panicLife = 10; mods.panicMax = 5; },
}));
