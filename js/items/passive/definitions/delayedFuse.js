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

export const icon = [
  '...........21...........',
  '...........21...........',
  '...1.......21.......1...',
  '..121......21......211..',
  '...121...222221...211...',
  '....1222222222222211....',
  '.....22220033002221.....',
  '.....22200033000221.....',
  '.....22000033000021.....',
  '....2200000330000021....',
  '....2200000330000021....',
  '222222000003300000222221',
  '111122000003333330211111',
  '....2200000000333021....',
  '....1200000000000011....',
  '.....22000000000021.....',
  '.....22200000000221.....',
  '.....22220000002221.....',
  '....2111122222111121....',
  '...211...112111...121...',
  '..111......21......111..',
  '...1.......21.......1...',
  '...........21...........',
  '...........11...........',
];
