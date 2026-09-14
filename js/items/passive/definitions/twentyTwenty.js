import { definePassiveItem } from '../shared.js';

export const id = 'twentyTwenty';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'TWENTY/TWENTY',
    max: 1,
    theme: THEME.precision,
    // The ammo line is the honest half of the deal and has to be on the card:
    // firing the pattern twice spends two rounds (see Player.shotCost), which
    // is what stops +20% net damage from being free. A 30-round magazine is a
    // 15-shot magazine with this taken, and that is the cost the player is
    // actually weighing.
    effects: [
      ['EVERY SHOT FIRES', GOOD],
      ['2 ROUNDS AT 60% DMG', NOTE],
      ['COSTS 2 AMMO PER SHOT', BAD],
    ],
    apply: (mods, n) => {
      mods.volley = 1 + n;
      mods.volleyDamage = 0.6;
    },
}));
