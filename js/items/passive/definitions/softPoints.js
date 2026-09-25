import { definePassiveItem } from '../shared.js';

// THE CROWD-CONTROL PICK THAT ONLY PAYS IF YOU HAVE SOME. Damage against a
// SLOWED body, read off the body's own status the way COLD FOOT reads the
// player's - so it composes with CRYO, with the ice a sprint lays, with
// whatever a future theme freezes with. A run with no slow at all gets
// nothing, which is the trade: the pick is priced against a second one.
//
// THE AFFLICTOR RULE'S MIRROR. The enemy side pays for its statuses by taking
// the lower half of a damage band; this is the player side of the same law -
// +30% is what a status the build had to buy is worth, and a pick that both
// slowed AND hit harder would be two picks in one slot.
export const id = 'softPoints';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'SOFT POINTS',
    max: 1,
    theme: 0xffca8a,
    effects: [['+30% DAMAGE TO', GOOD], ['SLOWED ENEMIES', NOTE]],
    apply: (mods, n) => { mods.softPoints = 0.3 * n; },
}));

// A MUSHROOMED ROUND IN FROST. The flattened nose with its hollow pit,
// and the frost that marks what it is owed.
export const icon = [
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '.............4..........',
  '..........4...4.........',
  '........................',
  '......444440044444......',
  '......424331133324......',
  '......111122221111......',
  '..........4221..........',
  '..........4221..........',
  '..........4331..........',
  '..........4331..........',
  '..........4331..........',
  '..........4331..........',
  '..........4221..........',
  '..........4221..........',
  '.........211111.........',
  '........................',
  '........................',
  '........................',
  '........................',
];
