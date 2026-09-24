import { definePassiveItem } from '../shared.js';

// THE RELOAD PICK THAT COSTS AMMUNITION. SPEED LOADER is the pure half of
// this trade at three tiers; this is the same money taken from the other
// pocket - a flat two rounds off the magazine for a fifth off the clock. The
// two are deliberately priced so neither strictly dominates: on a 30-round
// magazine two rounds is 6% of the magazine against 20% of the reload, and
// on the TUBE GUN two rounds is a tenth of the gun.
//
// THE CUT IS FLAT, exactly as MAGNA CARTA's bank is flat and for the same
// reason: "2 fewer rounds" has to stay true on the card whatever HOLLOW
// POINT did to the number underneath.
export const id = 'fatHandgun';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'FAT HANDGUN',
    max: 1,
    theme: 0xffc773,
    effects: [['RELOADS 20% FASTER', GOOD], ['MAG HOLDS 2 FEWER', BAD]],
    apply: (mods, n) => {
      mods.reloadMult *= Math.pow(0.8, n);
      mods.fatHandgun = 2 * n;
    },
}));

// A HANDGUN WITH A DRUM MAGAZINE HANGING OFF IT. Chunky grip, fat cylinder -
// the silhouette of a pistol that grew a magazine it cannot really carry.
export const icon = [
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '.33.44222222222222......',
  '.33.42332222222221......',
  '.3..42222222222221......',
  '....21111111111111......',
  '.....422124422221.......',
  '.....422340330331.......',
  '.....422022222221.......',
  '.....222222222221.......',
  '.....211121111111.......',
  '..........211111........',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
];
