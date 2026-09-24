import { definePassiveItem } from '../shared.js';

// THE AMMO CRATE THAT IS ALSO A MEAL. Five HP on every ammo pickup, on top
// of the rounds - so the most common drop in the game becomes a slow trickle
// of health the player collects by doing what they were doing anyway. It is
// priced small on purpose: ammo drops six times as often as health, and a
// full heal per crate would delete the health economy.
//
// THROUGH heal() AND NOT A WRITE, so HEALTHY CORE refuses it, BONE MARROW
// scales it and OVERDRAW banks what does not fit - the pick is a heal like
// every other heal, with no opinions of its own about the rules.
export const id = 'soupKitchen';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'SOUP KITCHEN',
    max: 1,
    theme: 0x81c784,
    effects: [['AMMO PICKUPS', GOOD], ['ALSO HEAL 5 HP', NOTE]],
    apply: (mods, n) => { mods.soupKitchen = 5 * n; },
}));

// THE BOWL WITH STEAM OVER IT. A pot of soup: the bowl, the rim, and the
// two rising curls that say it is hot.
export const icon = [
  '........................',
  '....2.3.......2.3.......',
  '...2.3.2.....2.3.2......',
  '..2.3.2.3...2.3.2.3.....',
  '..2.3.2.3...2.3.2.3.....',
  '...2.3.2.....2.3.2......',
  '....2.3.......2.3.......',
  '.....2.........2........',
  '........................',
  '...22222222222222.......',
  '..2333333333333332......',
  '.233333333333333332.....',
  '.233333333333333332.....',
  '.233344444444333332.....',
  '.233444444444443332.....',
  '.233444444444443332.....',
  '.23334444444433332......',
  '.233333333333333332.....',
  '.2333333333333333322....',
  '..233333333333333322....',
  '...2233333333333322.....',
  '....22222222222222......',
  '........................',
  '........................',
];
