import { definePassiveItem } from '../shared.js';

export const id = 'malady';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'MALADY',
    max: 1,
    theme: THEME.fire,
    // Poison and burn ONLY. Cryo, Terror and Petrify have no strength to
    // amplify, so the same trade on them would be a drawback with no upside.
    // The old line read "+50% POISON & BURN", which never said WHICH axis moved
    // - a player could not tell a stronger effect from a longer one. Name the
    // axis on its own line and the trade reads in one pass.
    effects: [
      ['POISON & BURN TICKS', NOTE],
      ['HIT 50% HARDER', GOOD],
      ['BUT LAST HALF AS LONG', BAD],
    ],
    apply: (mods, n) => {
      mods.dotPower *= 1 + 0.5 * n;
      mods.dotTime *= Math.pow(0.5, n);
    },
}));
