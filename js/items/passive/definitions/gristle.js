import { definePassiveItem } from '../shared.js';

// SCAR TISSUE OFF THE FLOOR INSTEAD OF OFF THE CLOCK. That pick banks max
// health at a wave clear, which is a thing that happens TO a run; this banks
// it off a crate, which is a thing the player walked to - so a run carrying
// it collects health it does not need, and the bar itself is what the wave
// paid out.
//
// ONE POINT AND NOT FIVE. It has no ceiling and no wave gate, so the number
// has to be small enough that thirty crates is thirty health and not a
// second run's worth of bar.
export const id = 'gristle';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'GRISTLE',
    max: 1,
    theme: 0xd7a3a3,
    effects: [['HEALTH CRATES: 30%', NOTE], ['CHANCE OF +1 MAX HP', GOOD], ['PERMANENTLY', NOTE]],
    apply: (mods, n) => { mods.gristleChance = 0.3 * n; mods.gristleHp = 1; },
}));

export const icon = [
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '......444444444444......',
  '.......2232222232.......',
  '......222442322222......',
  '..442.222223244222.244..',
  '...444444444444444444...',
  '....2222222222222222....',
  '..442.222222222222.244..',
  '.......1111111111.......',
  '......111111111111......',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
];
