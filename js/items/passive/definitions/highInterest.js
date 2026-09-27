import { definePassiveItem } from '../shared.js';

// ---- money, and what it buys that is not in the shop --------------------

// CREDITS THAT EARN. The only pick in the pool that pays for NOT spending,
// and it is deliberately paid at the wave END rather than per second: a rate
// would make standing in the shop the best move in the game, and the wave
// boundary is a thing the player cannot farm - it arrives when the room is
// empty and not before.
//
// IT COMPOUNDS, as the word means: the interest is paid into the balance the
// next wave's interest is measured against. THE CAP is what keeps that honest:
// a compounding fifth paid more than every other money pick combined once a
// run got rich, so the rate came down to a tenth and the payout is bounded at
// $2,000 a wave - banking still pays, it just stops being the whole build.
export const id = 'highInterest';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'HIGH INTEREST',
    max: 1,
    theme: 0xe0b040,
    effects: [['UNSPENT CREDITS EARN', NOTE], ['10% INTEREST', GOOD], ['CAPPED $2,000 PER WAVE', NOTE]],
    apply: (mods, n) => { mods.interest = 0.1 * n; mods.interestCap = 2000; },
}));

export const icon = [
  '........................',
  '........................',
  '........................',
  '.....................2..',
  '...................442..',
  '....444444442....24432..',
  '..4443333333342...4332..',
  '.24333333333332..44222..',
  '..2223333332222..422.2..',
  '.....2222222....442.....',
  '...............4422.....',
  '....222222221..422......',
  '..222222222222442.......',
  '.1222222222222222.......',
  '..1112222221111.........',
  '.....1111111............',
  '........................',
  '....222222221...........',
  '..2222222222221.........',
  '.12222222222221.........',
  '..1112222221111.........',
  '.....1111111............',
  '........................',
  '........................',
];
