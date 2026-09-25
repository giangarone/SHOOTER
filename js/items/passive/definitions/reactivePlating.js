import { definePassiveItem } from '../shared.js';

export const id = 'reactivePlating';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'REACTIVE PLATING',
    max: 3,
    theme: 0x00b0ff,
    effects: (n) => [
      ['SHOCKWAVE WHEN HIT', GOOD],
      ['DAMAGE ' + step(n, (k) => String(45 * k)), NOTE],
      ['RADIUS ' + step(n, (k) => 5 + k + 'm'), NOTE],
    ],
    apply: (mods, n) => {
      mods.shockwave += 45 * n;
      mods.shockwaveRadius = 5 + n;
    },
}));

// STRUCK, AND ANSWERING. The riveted plate with the impact star still in
// it, inside two shock frames: the square one going out, the pale one gone.
export const icon = [
  '........................',
  '........................',
  '........................',
  '.....42222224222222.....',
  '........................',
  '...2................2...',
  '...2...4333..3333...2...',
  '...2..3..........3..2...',
  '...2..3..444422..3..2...',
  '...2..3.44222242.3..2...',
  '...2..3.42224222.3..2...',
  '...2....22243422....2...',
  '...4....22240421....1...',
  '...2..3.21221211.3..2...',
  '...2..3..221111..3..2...',
  '...2..3..........3..2...',
  '...2..3..........3..2...',
  '...2...3333..3333...2...',
  '...2................2...',
  '........................',
  '.....22222221222221.....',
  '........................',
  '........................',
  '........................',
];
