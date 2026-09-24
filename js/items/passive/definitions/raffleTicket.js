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

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'RAFFLE TICKET',
    max: 1,
    theme: 0xc5a3ff,
    effects: [['EVERY BOX ROLL BOUGHT:', NOTE], ['+5% ITEM CHARGE RATE', GOOD], ['FOREVER', NOTE]],
    apply: (mods, n) => { mods.raffle = 0.05 * n; },
}));

export const icon = [
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '..2221....2001....22221.',
  '..2221....2001....22221.',
  '..222222222002222222221.',
  '..222222222002222222221.',
  '..223322222002222233331.',
  '..233322222002222233331.',
  '..223222222002222233331.',
  '..222111112001111122221.',
  '..2221....2001....22221.',
  '..2221....2001....22221.',
  '..1111....1111....11111.',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
];
