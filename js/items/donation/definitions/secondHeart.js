import { defineDonationItem } from '../shared.js';

export const id = 'secondHeart';
export default defineDonationItem(({ GOOD, NOTE }) => ({
  name: 'SECOND HEART', theme: 0xff5c8a,
  effects: [['+20 MAX HEALTH', GOOD], ['FULL HEAL ON PICKUP', NOTE]],
  apply: (mods) => { mods.maxHpBonus += 20; },
  onTake: (player) => { player.health = player.maxHealth; },
}));

// THE SPARE, CARRIED. One heart worn bright on the outside, and the second
// one riding behind it in the shadow - twenty more of bar, banked.
export const icon = [
  '........................',
  '........................',
  '........................',
  '......44..33....4.......',
  '.....42222231...........',
  '....2223433221..........',
  '....2234332221..........',
  '.....22233221...........',
  '......222221..11........',
  '.......2221111111.......',
  '........2111111111......',
  '........1111111111......',
  '.........11111111.......',
  '..........111111........',
  '...........1111.........',
  '............11..........',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
];
