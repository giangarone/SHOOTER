import { definePassiveItem } from '../shared.js';

// ACCURACY, BILLED BOTH WAYS. Hot Streak charges misses in damage; this
// charges them in blood, and pays hits in it. Per SHOT, so a shotgun's nine
// pellets are one hit or one miss - and it can never take the last point,
// for the same reason Cursed Ammo cannot.
export const id = 'aimOrBleed';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'AIM OR BLEED',
    max: 1,
    theme: THEME.aimOrBleed,
    effects: [['HITS HEAL 1 HP', GOOD], ['MISSES COST 1 HP', BAD], ['NEVER BELOW 1 HP', NOTE]],
    apply: (mods, n) => { mods.aimHeal = 1 * n; mods.missCost = 1 * n; },
}));
