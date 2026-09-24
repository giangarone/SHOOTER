import { definePassiveItem } from '../shared.js';

// THE PLAIN RED PICK. Thirty percent, no riders, no window, nothing to read
// but the number. Every damage pick in the pool buys its percentage with
// SOMETHING - a posture, a distance, a clock, a coin toss - and this one is
// deliberately the floor the rest are priced against: the pick a player
// takes when they do not want a puzzle, and the reason every other damage
// number in the pool has to be bigger than thirty to be worth its clause.
export const id = 'killSwitch';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'KILL SWITCH',
    max: 1,
    theme: 0xbf2b2b,
    effects: [['+30% DAMAGE', GOOD]],
    apply: (mods, n) => { mods.damage *= 1 + 0.3 * n; },
}));

// THE SWITCH, THROWN. A toggle on a plate - two screws, a dark slot, and the
// bat lever thrown up, drawn at the brightest tone in the ramp because the
// live part is the lit part. The one glyph that means "on, and now everything
// is different".
export const icon = [
  '........................',
  '........................',
  '......111111111111......',
  '.....14444411222221.....',
  '.....14222211222221.....',
  '.....12222222222221.....',
  '.....12222244222221.....',
  '.....12224444222221.....',
  '.....12222244222221.....',
  '.....12222244222221.....',
  '.....12222244222221.....',
  '.....12222244222221.....',
  '.....12222244222221.....',
  '.....12221144112221.....',
  '.....12221111112221.....',
  '.....12221111112221.....',
  '.....12221111112221.....',
  '.....12222222222221.....',
  '.....12222211222221.....',
  '.....12222211222221.....',
  '.....12222222222221.....',
  '......111111111111......',
  '........................',
  '........................',
];
