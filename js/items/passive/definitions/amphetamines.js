import { definePassiveItem } from '../shared.js';

// THE PLAIN ORANGE PICK, killSwitch's mirror. Fifteen percent fire rate,
// nothing else, no posture to hold and no beat to count - the floor every
// other rate number in the pool is priced against. SPEED LOADER is the
// adjacent plain pick and costs a third of a magazine slot for its clock;
// this is the one a player takes when the gun simply needs to be faster.
export const id = 'amphetamines';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'AMPHETAMINES',
    max: 1,
    theme: 0xef6c00,
    effects: [['+15% FIRE RATE', GOOD]],
    apply: (mods, n) => { mods.fireRate *= 1 + 0.15 * n; },
}));

// THE PILL. A two-tone capsule, split down the middle - the shape of the
// fastest thing in the pool, taken whole.
export const icon = [
  '........................',
  '........................',
  '.......2222222..........',
  '.....223333333322.......',
  '....23333333333332......',
  '...2333333333333332.....',
  '..233333333333333332....',
  '..233344444444443332....',
  '..233344444444443332....',
  '..233344444444443332....',
  '..233344444444443332....',
  '..233344444444443332....',
  '..233344444444443332....',
  '..233344444444443332....',
  '..233344444444443332....',
  '..233344444444443332....',
  '..233344444444443332....',
  '..233344444444443332....',
  '..233344444444443332....',
  '..233344444444443332....',
  '..233344444444443332....',
  '..223333333333333322....',
  '...22222222222222222....',
  '........................',
];
