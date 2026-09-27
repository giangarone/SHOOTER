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

// THE TAG, ALIGHT. Ninety-point mark on the face, cord still on, and the
// corner already going - the deal is good exactly as long as the tag lasts.
export const icon = [
  '........................',
  '........................',
  '........1...............',
  '.........1......3.......',
  '.......4..1.....4.......',
  '.......3..11...43.......',
  '.........42222133.......',
  '........42222221........',
  '.......4222002221.......',
  '.......4222222221.......',
  '.......4233222331.......',
  '.......4233223221.......',
  '.......4222233221.......',
  '.......4222332221.......',
  '.......4233223321.......',
  '.......4233223321.......',
  '.......4222222221.......',
  '.......4222222221.......',
  '.......2222222221.......',
  '........12222221........',
  '........................',
  '........................',
  '........................',
  '........................',
];
