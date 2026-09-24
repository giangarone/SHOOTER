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

// THE LUCKY STUB. A star-marked ticket with its perforated stub and
// serial windows, a second ticket layered behind - every roll banked,
// and the pile visibly growing.
export const icon = [
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '.....422222222222222221.',
  '.....222222222222222221.',
  '...42222222220222222121.',
  '...42222222220222222121.',
  '...42233222222220202121.',
  '...43433332220200002121.',
  '...43333332222233332121.',
  '...42223322222022222121.',
  '...42222222222222222121.',
  '...211111111101111111...',
  '....111111111111111111..',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
];
