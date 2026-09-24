import { definePassiveItem } from '../shared.js';

// ---- THE ELEVEN CONVERTED PICKS -----------------------------------------
//
// These eleven were sold, not given: a second row at the wave break charged
// MAX HEALTH for them, permanently. That row is gone (it sells active items
// now - see js/items/active/index.js), and they are ordinary passive items, rolled onto
// free totems like everything above.
//
// WHAT CHANGED WHEN THE PRICE DID. A paid pick did not need a drawback,
// because the price WAS the drawback and it was the same price for every
// build. Free, each one has to weigh itself, which is why the ones that did
// not already carry a real cost were given one. Only EXECUTIONER still
// charges health, and it charges it as a mod rather than as a payment: see
// mods.maxHpFlat.
export const id = 'carnage';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'CARNAGE',
    max: 1,
    theme: 0xff1744,
    // A CAP, and a smaller step under it. Uncapped at 5% a kill it was the
    // best damage in the game after twenty kills and absurd after fifty. At 1%
    // to a ceiling of +100% the hundred-kill chain is the target rather than
    // the accident, and what it costs you is that any hit at all takes it all
    // back - which is the whole drawback now that no health is charged for it.
    effects: [['EACH KILL: +1% DMG', GOOD], ['UP TO +100%', NOTE], ['GETTING HIT RESETS IT', BAD]],
    apply: (mods, n) => {
      mods.carnageStep = 0.01 * n;
      mods.carnageMax = 1.0 * n;
    },
}));

export const icon = [
  '........................',
  '.........2222221........',
  '.........1222211........',
  '..........22221.........',
  '..........22221.........',
  '..........22221.........',
  '..........22221.........',
  '....22222222222222221...',
  '....22222222222222221...',
  '....11112222222111111...',
  '........22222221........',
  '........42222221........',
  '........42222221........',
  '........43222221........',
  '........23222211........',
  '.........222211.........',
  '..........2211..........',
  '...........21...........',
  '...........21...........',
  '........................',
  '..........2...2.........',
  '.........442.22.........',
  '.........222............',
  '..........2.............',
];
