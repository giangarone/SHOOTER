import { definePassiveItem } from '../shared.js';

// ---- what happens around you --------------------------------------------

// PANIC TURRET, BOUGHT WITH KILLS INSTEAD OF WITH BLOWS. That pick answers a
// run that is losing and this one answers a run that is winning, which is why
// they are the same gun at two different prices - ten bodies and ten seconds,
// against one hit and ten seconds.
//
// IT IS THE ITEM'S OWN TURRET, unchanged: same class, same one-of-the-
// player's-shots per round, same half-beat. Its own cap, counted over the
// deployed list for the reason PANIC TURRET's is - a turret can be retired by
// MAX_DEPLOYED's eviction or by its own clock, and a counter would have to be
// decremented in both places.
export const id = 'quorum';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'QUORUM',
    max: 1,
    theme: THEME.quorum,
    effects: [['EVERY 10 KILLS:', NOTE], ['A FREE TURRET, 10s', GOOD]],
    apply: (mods, n) => { mods.quorumEvery = 10; mods.quorumLife = 10; mods.quorumMax = 3 * n; },
}));
