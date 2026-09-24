import { definePassiveItem } from '../shared.js';

// THE MAGAZINE THAT GROWS BY BEING RUN DRY. Every other mag pick scales the
// number the gun already has; this one banks one round per EMPTY RELOAD, so
// the magazine the run ends with is a count of the times the player stood
// there with the slide locked back. A run that never runs dry gets nothing,
// which is the honest shape of a card about bad habits paying off.
//
// THE BANK IS THE PICK. magMult would have multiplied whatever the build
// already did to the number and been worth more to a run holding HOLLOW
// POINT - a flat round per dry reload is the same for every gun, which is
// the only way "increase by 1" can stay true on the card.
export const id = 'magnaCarta';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'MAGNA CARTA',
    max: 1,
    theme: 0xc9b037,
    effects: [['EACH RELOAD FROM EMPTY:', NOTE], ['MAG +1, FOREVER', GOOD]],
    apply: (mods, n) => { mods.magnaCarta = n; },
}));

// A SCROLL WITH A SEAL. The Magna Carta itself, rolled: parchment body, wax
// seal at the foot, and the rows of the articles reading as horizontal lines.
export const icon = [
  '........................',
  '........................',
  '........................',
  '......433333333331......',
  '.......4222222221.......',
  '.......2332333321.......',
  '.......2222222221.......',
  '.......2332333321.......',
  '.......2222222221.......',
  '.......2332333321.......',
  '.......2222222221.......',
  '.......2332333321.......',
  '.......2222222221.......',
  '.......2332333321.......',
  '.......2222222221.......',
  '.......2222222221.......',
  '......233333333331......',
  '..........4334..........',
  '..........3431..........',
  '.........33..33.........',
  '........33....33........',
  '........................',
  '........................',
  '........................',
];
