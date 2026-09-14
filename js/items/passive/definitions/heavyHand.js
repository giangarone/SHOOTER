import { definePassiveItem } from '../shared.js';

// The straight trade, and the only one in the pool that charges rate for
// damage rather than the other way round. Net DPS is a hair under even; what
// it actually buys is a bigger number per round, which is what matters
// against armour, against a boss, and to a magazine that has to last.
export const id = 'heavyHand';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'HEAVY HAND',
    max: 1,
    theme: THEME.heavyHand,
    effects: [['+60% DAMAGE', GOOD], ['-40% FIRE RATE', BAD]],
    apply: (mods, n) => {
      mods.damage *= 1 + 0.6 * n;
      mods.fireRate *= Math.pow(0.6, n);
    },
}));
