import { definePassiveItem } from '../shared.js';

export const id = 'bailiff';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'BAILIFF',
    max: 1,
    theme: THEME.bailiff,
    // A FIFTH OF EVERY PRESS BACK. It is the only passive item in the pool
    // that reaches the active-item slot at all besides TWIN CELL, and the two
    // are opposites worth owning together: Twin Cell lets the player BANK a
    // second charge, this makes each one cost four fifths of what it did.
    //
    // A REFUND AND NOT A DISCOUNT, which is why it is written as charge handed
    // back after the spend rather than as a cheaper cost: the meter empties
    // when the button is pressed, exactly as it always has, and then a fifth
    // of it comes back. The player sees the item fire and the bar jump.
    effects: [['USING YOUR ITEM', NOTE], ['REFUNDS 20% OF ITS', GOOD], ['CHARGE BACK', NOTE]],
    apply: (mods, n) => { mods.bailiff = Math.min(0.9, 0.2 * n); },
}));
