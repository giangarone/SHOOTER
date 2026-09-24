import { definePassiveItem } from '../shared.js';

// TWICE AS MUCH, HALF AS LONG - and it is much less than half. An orb lies
// on the floor for 20 seconds and a crate for 30; at a 70% cut those are six
// and nine, which is barely longer than the fight that dropped them. The pick
// is a reason to go INTO the room a wave was fought in rather than to sweep
// it afterwards, and a player who hangs back loses more than the double ever
// paid them.
//
// THE WAVE-CLEAR SWEEP IS NOT A LOOPHOLE. It collects what is left, but the
// clock runs during the fight - so what the sweep finds is whatever survived
// six seconds, which on a long wave is the last few kills and nothing else.
export const id = 'fireSale';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'FIRE SALE',
    max: 1,
    theme: 0xff9e40,
    effects: [['ORBS & PICKUPS WORTH 2x', GOOD], ['BUT VANISH 70% FASTER', BAD]],
    apply: (mods, n) => { mods.lootMult = 1 + n; mods.lootDespawn = Math.pow(0.3, n); },
}));

export const icon = [
  '........................',
  '.................42.....',
  '................4432....',
  '...............443332...',
  '..............4433332...',
  '21............43333332..',
  '121......1....22333222..',
  '.121....221.....2222....',
  '..121..22221............',
  '...1200022221...........',
  '....0000022221..........',
  '....00000222221.........',
  '...2000002222221........',
  '..222000222222221.......',
  '.12222222222222221......',
  '..12222220000000021.....',
  '...11222200000000221....',
  '.....1222000000002111...',
  '......1222222222211.....',
  '.......12222222211......',
  '........112222111.......',
  '..........12211.........',
  '...........111..........',
  '............1...........',
];
