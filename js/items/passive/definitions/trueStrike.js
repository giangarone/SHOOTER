import { definePassiveItem } from '../shared.js';

// ---- THE CRIT FAMILY, THREE MORE ----------------------------------------

// THE PAUSE IS THE PICK. Two seconds off the trigger buys four certain
// crits, which is a burst rather than a rate - it pays the player who taps
// and takes cover and pays nothing at all to one holding the trigger down.
export const id = 'trueStrike';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'TRUE STRIKE',
    max: 1,
    theme: THEME.trueStrike,
    effects: [
      ['+10% CRIT DAMAGE', GOOD],
      ['HOLD FIRE 2s, THEN:', NOTE],
      ['NEXT 4 SHOTS CRIT', GOOD],
    ],
    apply: (mods, n) => {
      mods.critMult *= 1 + 0.1 * n;
      mods.trueStrikeWait = 2;
      mods.trueStrikeShots = 4 * n;
    },
}));
