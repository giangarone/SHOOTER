import { definePassiveItem } from '../shared.js';

// THE PICK THAT WATCHES YOUR BACK. One pellet straight behind on every
// trigger pull, at FULL damage - deliberately not a discount shot, because a
// half-strength backwards round would be a fire hazard rather than a weapon.
// It fires whether or not anything is there, exactly as the forward ones do,
// and it comes off no magazine at all: the card says "as well", not "instead".
//
// ONE PELLET, not the pattern: a shotgun already fires a wall forward, and a
// second wall backwards would be a different weapon entirely. The single
// round behind is the readable version - the thing chasing you gets exactly
// what was coming to it.
export const id = 'rearview';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'REARVIEW',
    max: 1,
    theme: 0xff9e80,
    effects: [['EVERY SHOT FIRES ONE', GOOD], ['BACKWARD, FULL DAMAGE', NOTE]],
    apply: (mods, n) => { mods.rearview = n; },
}));

// THE MIRROR WITH A ROUND IN IT. A rear-view mirror's rounded rectangle with
// a muzzle flash leaving it - the shape of a shot that came out of somewhere
// you were not looking.
export const icon = [
  '........................',
  '........................',
  '....11111111111111......',
  '...1333333333333321.....',
  '...13333333333333321....',
  '...13344333333333321....',
  '...13344333333333321....',
  '...13344333333333321....',
  '...13344333333333321....',
  '...13344333333333321....',
  '...13344333333333321....',
  '...13344333333333321....',
  '...13344333333333321....',
  '...13344333333333321....',
  '...13344333333333321....',
  '...13344333333333321....',
  '...13344333333333321....',
  '...13344333333333321....',
  '...13344333333333321....',
  '...13333333333333321....',
  '...1333333333333321.....',
  '....11111111111111......',
  '........................',
  '........................',
];
