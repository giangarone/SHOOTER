import { definePassiveItem } from '../shared.js';

// THE BOX, BANKED. Every roll ever bought makes the item meter fill faster,
// for the rest of the run - so the mystery box stops being a thing a run
// visits and becomes a thing a run is built around, and the doubling price
// at each shop is what keeps that from being free.
//
// IT IS THE RATE AND NOT THE CEILING, which is TWIN CELL's. A player holding
// both banks two charges and fills them faster; neither pick does the other's
// job.
export const id = 'raffleTicket';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'RAFFLE TICKET',
    max: 1,
    theme: THEME.raffleTicket,
    effects: [['EVERY BOX ROLL BOUGHT:', NOTE], ['+5% ITEM CHARGE RATE', GOOD], ['FOREVER', NOTE]],
    apply: (mods, n) => { mods.raffle = 0.05 * n; },
}));
