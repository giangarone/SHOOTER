import { definePassiveItem } from '../shared.js';

// ---- the crit family, three more ----------------------------------------

// CHEEKWELD'S TRADE, POINTED OUTWARD. That pick buys armour down the sights
// and this buys crit, off the same `aiming` flag and for the same reason -
// the player is paid for the DECISION, not for the weapon finishing its
// raise. +25% on a 5% base is a sixfold crit rate for as long as the sights
// are up, which is the largest single step the crit family has.
export const id = 'ironLiturgy';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'IRON LITURGY',
    max: 1,
    theme: THEME.ironLiturgy,
    effects: [['+25% CRIT CHANCE', GOOD], ['WHILE AIMING', NOTE]],
    apply: (mods, n) => { mods.aimCrit = 0.25 * n; },
}));
