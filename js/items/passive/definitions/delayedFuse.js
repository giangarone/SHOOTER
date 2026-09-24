import { definePassiveItem } from '../shared.js';

// SPLASH DAMAGE, PAID FOR IN TIME. Every round sticks and does nothing for
// two seconds, then goes off for what it was worth over a small area. It is
// the whole gun turned into a grenade launcher: enormous against a crowd,
// and genuinely bad against the one thing walking at you.
export const id = 'delayedFuse';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'DELAYED FUSE',
    max: 1,
    theme: 0xff7519,
    effects: [['SHOTS STICK TO ENEMIES', GOOD], ['THEN EXPLODE, 2s LATER', NOTE]],
    apply: (mods, n) => { mods.fuseDelay = 2; mods.fuseRadius = 2.5 * n; },
}));

// THE ROUND THAT WAITS. A sparking fuse running down into a cased bomb
// with its two-second pips showing through the face - stuck on, counting
// down, about to be a grenade launcher.
export const icon = [
  '........................',
  '.............4..........',
  '............343.........',
  '............333.........',
  '.............33.........',
  '..............33........',
  '..............3.........',
  '...........4331.........',
  '........42222221........',
  '...333.4333333331.......',
  '.......4220020021.333...',
  '...333.4222222221.......',
  '.......2222222221.333...',
  '........21111111........',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
];
