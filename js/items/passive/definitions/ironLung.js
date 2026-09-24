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

export const icon = [
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '...222222222222222221...',
  '.22222222222222222222221',
  '.22222222222222222222221',
  '.11122222222222222211111',
  '....2233332222333321....',
  '....2333332222333331....',
  '....4300033223300032....',
  '....2300033223300022....',
  '.....43333222233332.....',
  '.....23333222233331.....',
  '.....22222222222221.....',
  '.....12222222222211.....',
  '......112222222111......',
  '........12222211........',
  '.........122211.........',
  '..........1111..........',
  '........................',
  '........................',
  '........................',
];
