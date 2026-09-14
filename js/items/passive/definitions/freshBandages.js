import { definePassiveItem } from '../shared.js';

// THE RELOAD AS A SECOND VERB. Two health is small and the reload is the one
// thing a player does dozens of times a wave, so over a fight it is a real
// trickle - and it is gated at half the bar, so a run that is winning gets
// nothing from it at all.
//
// ON THE MAGAZINE SEATING, not on the button. It rides the same one-frame
// signal RELOAD BURST and HELLFIRE do, so a reload cancelled halfway pays
// nothing.
export const id = 'freshBandages';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'FRESH BANDAGES',
    max: 1,
    theme: THEME.freshBandages,
    effects: [['EACH RELOAD HEALS 2 HP', GOOD], ['AT HALF HP OR BELOW', NOTE]],
    apply: (mods, n) => { mods.bandage = 2 * n; },
}));
