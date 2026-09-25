import { definePassiveItem } from '../shared.js';

// ---- AMMUNITION AND MONEY ------------------------------------------------

// A FLAT HUNDRED A BODY, which is worth more early than Midas and less late -
// it does not scale with the enemy, so it pays a wave of chaff and shrugs at
// a boss. The damage is what it charges, and it charges it on every source.
export const id = 'payday';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'PAYDAY',
    max: 1,
    theme: 0xffca00,
    effects: [['+$100 PER KILL', GOOD], ['DAMAGE -10%', BAD]],
    apply: (mods, n) => {
      mods.killCredits = 100 * n;
      mods.damage *= Math.pow(0.9, n);
    },
}));

// PAID IN FULL, IN AN ENVELOPE. The coin rising off the pile, the sealed
// flap, and the tag that says what the damage cost.
export const icon = [
  '........................',
  '........................',
  '........................',
  '..........4422..........',
  '.........430322.........',
  '.........223021.........',
  '..........2221..........',
  '..4..................4..',
  '........................',
  '....4444444444444441....',
  '....4112222222222111....',
  '....4221122222222222....',
  '....4222211331123322....',
  '....4222222332222222....',
  '....4222222112222221....',
  '...442222222222222214...',
  '....4222222222222221....',
  '....4111111111111111....',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
];
