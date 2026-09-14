import { definePassiveItem } from '../shared.js';

export const id = 'nanoweave';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'NANOWEAVE',
    max: 2,
    theme: THEME.vitality,
    // THE ONLY SOURCE OF REGENERATION IN THE GAME besides Antidote's leech -
    // there is no natural trickle underneath it any more (see Player's mods
    // block), so this is a real pick rather than a bigger version of something
    // every run already had. Priced accordingly: 2 HP/s is slow enough that it
    // never wins a fight on its own, and the 5s window means it only pays a
    // player who actually broke contact. It does not tick in the wave break.
    effects: (n) => [
      ['REGEN ' + step(n, (k) => 2 * k + ' HP/s'), GOOD],
      ['STARTS ' + step(n, (k) => secs(Math.max(4, 6 - k))), GOOD],
      ['AFTER BEING HIT', NOTE],
      ['IN COMBAT ONLY', NOTE],
    ],
    apply: (mods, n) => {
      mods.regenDelay = Math.max(4, 6 - n);
      mods.regenRate = 2 * n;
    },
}));
