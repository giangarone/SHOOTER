import { definePassiveItem } from '../shared.js';

// THE TOP OF EVERY WAVE, GUARANTEED. Three plates off the first three bodies,
// through the same table PINATA draws from - so it is ammunition when the
// reserve is thin, health when the bar is, a battery when the item slot has
// room, and the rarer buffs when none of those is wanted.
//
// AT THE START AND NOT AT THE END, which is the whole difference between this
// and CURTAIN CALL. That pick pays at the clear, into a shop; this pays into
// the fight, at the moment the player still has a wave in front of them and
// the drop can change how it goes.
//
// A REFUSED DROP DOES NOT SPEND ONE, on PINATA's terms: a floor already at
// MAX_ACTIVE_PICKUPS and a player full of everything the table can offer are
// both refusals that are not the player's fault, so the kill drops nothing
// and the next one tries again.
export const id = 'firstFruits';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'FIRST FRUITS',
    max: 1,
    theme: THEME.firstFruits,
    effects: [['FIRST 3 KILLS OF EACH', NOTE], ['WAVE DROP A POWERUP', GOOD]],
    apply: (mods, n) => { mods.firstFruits = 3 * n; },
}));
