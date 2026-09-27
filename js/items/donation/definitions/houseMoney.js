import { defineDonationItem } from '../shared.js';

export const id = 'houseMoney';
export default defineDonationItem(({ GOOD, NOTE }) => ({
  name: 'HOUSE MONEY', theme: 0x8bc34a,
  effects: [['PAYOUTS DOUBLED', GOOD], ['FIRST 30s OF EACH WAVE', NOTE]],
  apply: (mods) => { mods.donationHouse = 30; },
}));

// THE HOUSE THAT PAYS OUT. Chimney drawing, windows lit, and the door
// handle a gold coin glowing in the dark - the first thirty seconds of
// every wave, doubled.
export const icon = [
  '........................',
  '...............1........',
  '................1.......',
  '...........21..20.......',
  '..........2221.21.......',
  '.........42222121.......',
  '........422222221.......',
  '.......42222222221......',
  '......4222222222221.....',
  '.....4222222222222221...',
  '....1111111111111111....',
  '......422222222221......',
  '......433000000331......',
  '......434024420431......',
  '......422043310221......',
  '......422023120221......',
  '......422111111221......',
  '......422222222221......',
  '......111111111111......',
  '.....1111111111111111...',
  '........................',
  '........................',
  '........................',
  '........................',
];
