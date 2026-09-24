import { definePassiveItem } from '../shared.js';

// ONE PER WAVE, at the moment the player is least able to go and look for a
// crate. It fires on the way DOWN through twenty, so it cannot be farmed by
// hovering there - the bar has to cross the line.
export const id = 'lastBreath';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'LAST BREATH',
    max: 1,
    theme: 0xfdd835,
    effects: [['DROP BELOW 20 HP:', NOTE], ['FULL AMMO RESERVE', GOOD], ['ONCE PER WAVE', NOTE]],
    apply: (mods, n) => { mods.lastBreath = 20 * n; },
}));

// THE NEEDLE IN THE RED. A gauge with its needle buried in the danger zone,
// and everything the magazine was missing pouring out underneath - one full
// reserve, once a wave, at the moment it matters.
export const icon = [
  '........................',
  '........................',
  '........................',
  '..........4331..........',
  '........42222331........',
  '.......4322223331.......',
  '.......3222222331.......',
  '.......3222223331.......',
  '.......3222233331.......',
  '.......2224432221.......',
  '.......2222222221.......',
  '........22222221........',
  '.........211111.........',
  '..........4331..........',
  '..........4331..........',
  '..........4331...4......',
  '..........4311..........',
  '.........433331.........',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
];
