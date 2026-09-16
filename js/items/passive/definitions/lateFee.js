import { definePassiveItem } from '../shared.js';

// THE OVERDUE FINE. Three percent per ten seconds the CURRENT wave has run,
// reset to nothing at every wave end - so the pick pays the player for the
// room overstaying its welcome and pays nothing at all to a run that clears
// fast. It is deliberately uncapped like LONG HAUL is: the ceiling is that
// the wave ENDS, and a wave that has run four minutes is a wave the pick has
// carried the player through the worst of.
//
// A WAVE'S OWN CLOCK, not a fight's: `startedAt` is the moment the wave was
// booked, boss and ground alike, and the reset is the wave boundary itself -
// see Game.startWave.
export const id = 'lateFee';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'LATE FEE',
    max: 1,
    theme: THEME.lateFee,
    effects: [['+3% DAMAGE PER 10s', GOOD], ['THE WAVE HAS RUN', NOTE]],
    apply: (mods, n) => { mods.lateFee = 0.03 * n; mods.lateFeeEvery = 10; },
}));

// A STAMPED BILL. The invoice: a rectangle with the corner folded, a line of
// figures, and a big stamp across the bottom - the shape of a debt that
// grows while you wait.
export const icon = [
  '........................',
  '..222222222222222.......',
  '..2333333333333332......',
  '..2333333333333332......',
  '..2333444333333332......',
  '..2333444333333332......',
  '..23334443333233332.....',
  '..23333333333323332.....',
  '..23334443333323332.....',
  '..23334443333333332.....',
  '..2333444333333332......',
  '..2333333333333332......',
  '..2333322222233332......',
  '..2333322222233332......',
  '..2333333333333332......',
  '..2322222222232332......',
  '..2323333333322332......',
  '..2323333333322332......',
  '..2322222222222332......',
  '..2333333333333332......',
  '..2233333333333322......',
  '...2222222222222222.....',
  '........................',
  '........................',
];
