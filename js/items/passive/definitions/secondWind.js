import { definePassiveItem } from '../shared.js';

// THE BAR DOES NOT GET LONGER. Stamina is a rhythm - sprint, break, sprint -
// and a longer bar changes how long one sprint is rather than how often the
// rhythm comes round. Halving the drain and doubling the regen is the same
// budget spent on the part the player actually feels: it is the WAIT that a
// sprint build is paying, not the run.
export const id = 'secondWind';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'SECOND WIND',
    max: 1,
    theme: 0x26c6da,
    effects: [['SPRINT TWICE AS LONG', GOOD], ['STAMINA BACK 2x FASTER', GOOD]],
    apply: (mods, n) => {
      mods.staminaDrain *= Math.pow(0.5, n);
      mods.staminaRegen *= 1 + n;
    },
}));

export const icon = [
  '........................',
  '........................',
  '........................',
  '........................',
  '.222222222222221........',
  '1222222222222221........',
  '.1111111111113332.......',
  '.............22232......',
  '................42......',
  '...............442......',
  '...............432......',
  '2222222222222222221.....',
  '11111111111111123332....',
  '...............233332...',
  '................22232...',
  '...................422..',
  '..................442...',
  '.2222222222221....422...',
  '12222222222221....22....',
  '.11111111112332.........',
  '............2332........',
  '.............432........',
  '.............422........',
  '.............22.........',
];
