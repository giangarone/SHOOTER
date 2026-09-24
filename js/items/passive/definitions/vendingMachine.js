import { definePassiveItem } from '../shared.js';

export const id = 'vendingMachine';

export default definePassiveItem(({ GOOD, BAD, NOTE }) => ({
    name: "VENDING MACHINE",
    max: 1,
    theme: 0xec407a,
    effects: [['EVERY 15 KILLS:', NOTE], ['DROP A RANDOM POWERUP', GOOD]],
    apply: (mods, n) => { mods.vendingEvery = 15; },
}));

// THE PRIZE CABINET. A lit marquee up top, two stocked shelves behind
// glass with the shine running down it, and the pickup flap below with
// the next powerup already dropped - fifteen kills away.
export const icon = [
  '........................',
  '........................',
  '.....43333333333331.....',
  '.....43300400333331.....',
  '.....41111111111111.....',
  '.....44222222222221.....',
  '.....44342434243421.....',
  '.....23332333233321.....',
  '.....23312331233121.....',
  '.....23333333333331.....',
  '.....24342434243421.....',
  '.....23312331233121.....',
  '.....23333333333331.....',
  '.....21111111111111.....',
  '.....22200000000221.....',
  '.....22200433300221.....',
  '.....22200033100221.....',
  '.....22222222222221.....',
  '.....23232222222001.....',
  '.....21111111111111.....',
  '......111......111......',
  '........................',
  '........................',
  '........................',
];

