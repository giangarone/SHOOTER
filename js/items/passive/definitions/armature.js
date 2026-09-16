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

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'ARMATURE',
    max: 1,
    theme: THEME.armature,
    effects: [['EXCESS KILL DAMAGE', NOTE], ['ADDS TO YOUR NEXT SHOT', GOOD]],
    apply: (mods, n) => { mods.armature = n; },
}));

// A COIL AROUND A BAR. An armature is the winding that carries the current -
// drawn here as a bar with the coil banked around its middle, the shape of
// energy being carried forward.
export const icon = [
  '........................',
  '........................',
  '.....11111111111........',
  '....13333333333321......',
  '....13342222222221......',
  '...13342222222222221....',
  '...134222222222222221...',
  '..13342222444422222221..',
  '..13342222444422222221..',
  '..13422222444422222221..',
  '..13422222444422222221..',
  '..13342222444422222221..',
  '..13342222444422222221..',
  '..13422222444422222221..',
  '..13422222444422222221..',
  '..13342222444422222221..',
  '...133422224444222221...',
  '...133422222222222221...',
  '....1334222222222211....',
  '.....1333333333321......',
  '......111111111111......',
  '........................',
  '........................',
  '........................',
];
