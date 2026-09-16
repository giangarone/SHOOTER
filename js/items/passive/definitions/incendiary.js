import { definePassiveItem } from '../shared.js';

export const id = 'incendiary';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'INCENDIARY',
    max: 1,
    theme: THEME.fire,
    // Twice a beat where poison is once: fire is the fierce, short one and
    // poison the patient one, and on the beat that difference is audible.
    effects: [
      ['SHOTS SET ENEMIES', GOOD],
      ['10 DAMAGE PER TICK, 3s', NOTE],
      ['FIRE SPREADS ON DEATH', NOTE],
    ],
    apply: (mods, n) => {
      mods.burnPower = 1 * n;
      mods.burnTime = 3 * n;
      mods.burnSpread = 3 * n;
    },
}));
