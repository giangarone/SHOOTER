import { defineDonationItem } from '../shared.js';

export const id = 'goldStar';
export default defineDonationItem(({ GOOD, NOTE }) => ({
  name: 'GOLD STAR', theme: 0xffd700,
  effects: [['10 CLEAN KILLS:', NOTE], ['+4% DAMAGE, MAX +40%', GOOD]],
  apply: (mods) => { mods.donationGoldStep = 0.04; mods.donationGoldCap = 0.4; mods.donationGoldEvery = 10; },
}));

// THE FACETED ONE, ON ITS RIBBON. Ten faces cut so five catch the light,
// a hot centre, tails behind - ten clean kills to a step, up to forty.
export const icon = [
  '........................',
  '...........4............',
  '...........1............',
  '...........1............',
  '..........411.......4...',
  '..........222...........',
  '..........222...........',
  '....441222232222411.....',
  '......42223332221.......',
  '.......223343322........',
  '........2233322.........',
  '........2223222.........',
  '........2222222.........',
  '.......112...244........',
  '.....2214.....14122.....',
  '...3.224.......1122.....',
  '.....221........122.....',
  '.....221........122.....',
  '.....221........122.....',
  '.....111........111.....',
  '........................',
  '........................',
  '........................',
  '........................',
];
