import { definePassiveItem } from '../shared.js';

// TELLTALE'S PATIENT COUSIN. That one turns the third hit on a body into a
// crit; this one turns the body itself into a soft target, permanently, for
// everything - the gun, a turret, poison, a blast, another enemy's friendly
// fire. Three hits is one burst.
export const id = 'weakPoint';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'WEAK POINT',
    max: 1,
    theme: THEME.weakPoint,
    effects: [
      ['3 HITS ON AN ENEMY', GOOD],
      ['MARK IT: +50% DMG TAKEN', NOTE],
      ['FROM ALL SOURCES', NOTE],
    ],
    apply: (mods, n) => { mods.markHits = 3; mods.markBonus = 0.5 * n; },
}));
