import { definePassiveItem } from '../shared.js';

// =========================================================================
// THE REST
// =========================================================================
export const id = 'rabbitsFoot';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: "RABBIT'S FOOT",
    max: 2,
    theme: THEME.charm,
    // A MULTIPLIER ON EVERY CATEGORY'S CHANCE, applied inside rollDrop where
    // the need term has already been added - so it lifts the floor for a
    // player who is fine and lifts the already-raised chance for a player who
    // is not, in the same proportion. Adding a flat 15 points instead would
    // have been worth four times as much to a full-health player as to a
    // desperate one, which is backwards for a luck charm.
    effects: (n) => [
      ['ENEMY DROPS ' + step(n, pctUp(15)), GOOD],
      ['MORE LIKELY, EVERY KILL', NOTE],
    ],
    apply: (mods, n) => { mods.dropLuck *= 1 + 0.15 * n; },
}));
