import { definePassiveItem } from '../shared.js';

// MONEY IS ON THE FLOOR NOW, so how far you have to walk to get it is a stat,
// and this is the passive item that buys it. Three tiers because the interesting
// part is the SHAPE of the growth: at one tier the orbs near your feet come
// to you, at three the whole patch of floor a fight happened on empties as
// you cross it, and the difference between those is a different way of
// moving through a wave rather than a bigger number.
//
// It pulls ammo and health as well, at MAGNET_PICKUP_FRACTION of the radius
// (see main.js). Money alone would have made it an economy pick competing
// with Midas and Scavenger; pulling everything makes it a pick about not
// having to break off a fight to collect things, which nothing else in the
// pool does.
export const id = 'lodestone';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'LODESTONE',
    max: 3,
    theme: THEME.lodestone,
    effects: (n) => [
      ['PICKUP RANGE', NOTE],
      [step(n, pctUp(50)), GOOD],
      ['MONEY COMES TO YOU', NOTE],
    ],
    // +50% a tier and not more, because the radius it multiplies is already
    // five metres: at the tier the arena is 44 across, and a passive item that
    // empties half the room from a standstill stops being a way of moving and
    // starts being a way of not having to.
    apply: (mods, n) => {
      mods.magnetMult = 1 + 0.5 * n;
    },
}));

export const icon = [
  '...........21...........',
  '...........42...........',
  '..........4432..........',
  '..........2322..........',
  '...........22...........',
  '........................',
  '........................',
  '.........222221.........',
  '........22222221........',
  '.......2222332221.......',
  '.......2223333221.......',
  '.......2233333321.......',
  '.......2233333321.......',
  '.......2223333221.......',
  '.......1222332211.......',
  '...42...12222211...42...',
  '...422...111111...242...',
  '.1122..............2211.',
  '.1....................1.',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
];
