import { definePassiveItem } from '../shared.js';

export const id = 'bloodPact';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'BLOOD PACT',
    max: 1,
    theme: THEME.pact,
    effects: [['KILLS HEAL 3 HP', GOOD], ['TAKE 25% MORE DAMAGE', BAD]],
    apply: (mods, n) => {
      mods.killHeal = 3 * n;
      mods.damageTakenMult *= 1 + 0.25 * n;
    },
}));
