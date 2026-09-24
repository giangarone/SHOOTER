import { definePassiveItem } from '../shared.js';

export const id = 'vampiric';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'VAMPIRIC ROUNDS',
    max: 3,
    theme: 0xff2d6f,
    effects: (n) => [
      ['HEAL 1 HP ON KILL,', GOOD],
      ['CHANCE ' + step(n, (k) => 25 * (k + 1) + '%'), NOTE],
    ],
    // Chance per kill, one stack at a time: 50%, then 75%, then every kill.
    apply: (mods, n) => { mods.killHealChance = 0.25 * (n + 1); },
}));

// THE FINNED ROUND. A fat slug on a brass casing, swept fins at the
// shoulder, and the blood it paid out falling on both sides - the kill
// that heals, mid-flight.
export const icon = [
  '........................',
  '..................4.....',
  '...........44...........',
  '..........4331..........',
  '..........4331..........',
  '..........4331..........',
  '..........4331..........',
  '..........4331..........',
  '.......43.2002.34.......',
  '.......32.3221.23.......',
  '..........3221..........',
  '..........3221..........',
  '.....3...433331.........',
  '....433...2332..........',
  '....331...1111..........',
  '.....1............3.....',
  '.................433....',
  '.................331....',
  '..................1.....',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
];
