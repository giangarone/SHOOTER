import { definePassiveItem } from '../shared.js';

// OVERKILL'S OTHER READING. That pick walks the spill to a NEIGHBOUR; this
// banks it onto the next SHOT. The two are deliberately compatible - a run
// holding both is a run where nothing is wasted twice over - and the bank is
// CAPPED AT ONE KILL'S SPILL so a chain of small kills cannot compound a
// one-shot into infinity.
//
// THE BANK RIDES THE SHOT, not the stat: it is added as a FLAT number to the
// first round that leaves the barrel after the bank was opened, so a build's
// multipliers get their say on it exactly as they would on the original blow.
export const id = 'armature';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'ARMATURE',
    max: 1,
    theme: 0xe86a17,
    effects: [['EXCESS KILL DAMAGE', NOTE], ['ADDS TO YOUR NEXT SHOT', GOOD]],
    apply: (mods, n) => { mods.armature = n; },
}));

// THE BANKED CHARGE. An induction coil around a hot core - the kill's spare
// damage held in the winding, lit in the gaps between the rings, already
// spitting at the muzzle end.
export const icon = [
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '.....42.42.42.42.42.....',
  '.....22422422422421.....',
  '...4222322322322321.3...',
  '...222232232232232134...',
  '...222232232232232133.4.',
  '...2222322322322321.3...',
  '...2222122122122121.....',
  '.....22122122122121.....',
  '.....11.11.11.11.11.....',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
];
