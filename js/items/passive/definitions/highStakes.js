import { definePassiveItem } from '../shared.js';

// THE SHOP, GAMBLED WITH. Nine visits in ten it is the best economy pick in
// the game - every reroll and every box roll free, price ladder and all - and
// the tenth is the worst thing that can happen to a run that is winning.
//
// The price check goes with the price: a player carrying this can always
// pull the lever, which is what makes the tenth pull a real risk rather than
// a discount they were saving up for anyway.
export const id = 'highStakes';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'HIGH STAKES',
    max: 1,
    theme: 0xff1493,
    effects: [['REROLLS & BOX ROLLS', GOOD], ['ARE FREE', GOOD], ['10% PER ROLL: YOU', BAD], ['DROP TO 1 HP & 1 AMMO', BAD]],
    apply: (mods, n) => { mods.highStakes = n; mods.stakesOdds = 0.1; },
}));

export const icon = [
  '........................',
  '........................',
  '........................',
  '...........21...........',
  '.........444342.........',
  '.......4443333342.......',
  '......443220022332......',
  '.....42222200221232.....',
  '.....22.22200221.22.....',
  '...242..22000021........',
  '....22..22000021........',
  '........22000021........',
  '........22000021........',
  '........22000021........',
  '........22000021........',
  '........22000021........',
  '.....42.22200221.42.....',
  '.....23422200222422.....',
  '......233220022322......',
  '.......2233333222.......',
  '.........223222.........',
  '...........11...........',
  '........................',
  '........................',
];
