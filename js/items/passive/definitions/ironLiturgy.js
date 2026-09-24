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

export const icon = [
  '........................',
  '...........21...........',
  '.........222221.........',
  '.......2222222221.......',
  '.....22111111111221.....',
  '....2211........1221....',
  '....211....442...121....',
  '...211.....432....121...',
  '...21......432.....21...',
  '..221......432.....221..',
  '..221...444433442..221..',
  '.2221...222332222..2221.',
  '.1221......432.....2211.',
  '..221......432.....221..',
  '..121......432.....211..',
  '...21......432.....21...',
  '...121.....432....211...',
  '....221....432...221....',
  '....1221...432..2211....',
  '.....11222222222111.....',
  '.......1122222111.......',
  '.........112111.........',
  '...........11...........',
  '........................',
];
