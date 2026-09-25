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

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'FRESH BANDAGES',
    max: 1,
    theme: 0xa5d6a7,
    effects: [['EACH RELOAD HEALS 2 HP', GOOD], ['AT HALF HP OR BELOW', NOTE]],
    apply: (mods, n) => { mods.bandage = 2 * n; },
}));

export const icon = [
  '........................',
  '........................',
  '........................',
  '........................',
  '.........44444..........',
  '.........42122..........',
  '....4....42212.....4....',
  '.........42221..........',
  '.....4444244441441......',
  '.....2122243322221......',
  '.....2212233322221......',
  '.....2221233322221......',
  '.....2222122222221......',
  '.........22222..........',
  '.........22222..........',
  '.........22222.4422.....',
  '.........21111.2032.....',
  '...............2224.....',
  '................2122....',
  '...................2....',
  '...................22...',
  '....................1...',
  '........................',
  '........................',
];
