import { definePassiveItem } from '../shared.js';

export const id = 'eternalAffliction';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'ETERNAL AFFLICTION',
    max: 1,
    theme: 0x7b1fa2,
    // The drafted drawback was "status effects on you last twice as long", and
    // the player has no status effects - only hazard zones to stand out of. So
    // the cost lands on those instead, which is the same idea in the vocabulary
    // the game actually has.
    effects: [['STATUS ON ENEMIES', GOOD], ['NEVER EXPIRES', NOTE], ['POOLS & LAVA HURT YOU 2x', BAD]],
    apply: (mods, n) => {
      mods.statusEternal = n;
      mods.hazardMult *= 2;
    },
}));

export const icon = [
  '........................',
  '........................',
  '........................',
  '..........1.............',
  '..........221...........',
  '........22433221........',
  '.......2223332221.......',
  '......221133211231......',
  '.....2211.2221.4221.....',
  '....2211..1111221221....',
  '....221..........221....',
  '....221..........221....',
  '....221..........221....',
  '....221..........221....',
  '....221..........221....',
  '....221..........221....',
  '....1221........2211....',
  '.....1221......2211.....',
  '......122222222211......',
  '.......1222222211.......',
  '........11111111........',
  '........................',
  '........................',
  '........................',
];
