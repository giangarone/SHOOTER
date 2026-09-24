import { definePassiveItem } from '../shared.js';

// ---- STAYING ALIVE -------------------------------------------------------

// NOTHING STICKS. Fire, poison, chill, fear, weakness and curse all simply
// fail to land - which is most of what the hazard-heavy themes have to say -
// and the price is on the other end of the same bar.
export const id = 'ironLung';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'IRON LUNG',
    max: 1,
    theme: 0x26a69a,
    effects: [['IMMUNE TO ALL STATUS', GOOD], ['HEALING -30%', BAD]],
    apply: (mods, n) => {
      mods.statusImmune = n;
      mods.poisonImmune = n;
      mods.healMult *= Math.pow(0.7, n);
    },
}));

// THE FILTER THAT BREATHES. A ribbed iron lung on its trachea, a bright
// ward seated in the middle of the ribs, and hazard drops bouncing off
// both sides - nothing sticks, at thirty percent off the heal.
export const icon = [
  '........................',
  '........................',
  '...........22...........',
  '..........2332..........',
  '..........2332..........',
  '.........433331.........',
  '........42222221........',
  '....3...43333331........',
  '...343..42222221........',
  '...331..43333331........',
  '......3.42222221........',
  '........33444431...3....',
  '........23444431..343...',
  '........22434321..331...',
  '........42222221.3......',
  '.........422221.........',
  '..........2111..........',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
];
