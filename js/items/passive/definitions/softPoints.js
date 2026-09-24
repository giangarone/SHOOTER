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

// A BULLET WITH A DENT IN IT. The hollow-cavity profile - a round nose with
// the soft pit - which is what "soft point" means on a box of ammunition.
export const icon = [
  '........................',
  '........................',
  '.......11111............',
  '.....1122222211.........',
  '....122222222221........',
  '...12222222222221.......',
  '..1222233333222221......',
  '..1222233333332221......',
  '..1222333333333221......',
  '..1223332223333221......',
  '..1233322..23332221.....',
  '..1233222...2332221.....',
  '..1233222...2332221.....',
  '..1233322..23332221.....',
  '..12233322233332221.....',
  '..1222233333333221......',
  '..1222233333332221......',
  '..1222233333222221......',
  '...12222222222222.......',
  '....1222222222221.......',
  '.....11222222111........',
  '.......11111............',
  '........................',
  '........................',
];
