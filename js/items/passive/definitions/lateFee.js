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

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'LATE FEE',
    max: 1,
    theme: 0xa1442e,
    effects: [['+3% DAMAGE PER 10s', GOOD], ['THE WAVE HAS RUN', NOTE]],
    apply: (mods, n) => { mods.lateFee = 0.03 * n; mods.lateFeeEvery = 10; },
}));

// A STAMPED BILL. The invoice: a rectangle with the corner folded, a line of
// figures, and a big stamp across the bottom - the shape of a debt that
// grows while you wait.
export const icon = [
  '........................',
  '........................',
  '........................',
  '........................',
  '....422222222222222.....',
  '....4222222222222241....',
  '....4443322222222002....',
  '....443432222222222.....',
  '....443312222222222.....',
  '....223332223333322.....',
  '....223333322333332.....',
  '....223332222222222.....',
  '....222222222222222.....',
  '....033333333333330.....',
  '....033030330330330.....',
  '....000000000000000.....',
  '....222222222222222.....',
  '....1111111111111111....',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
];
