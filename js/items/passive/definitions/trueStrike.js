import { definePassiveItem } from '../shared.js';

// ---- THE CRIT FAMILY, THREE MORE ----------------------------------------

// THE PAUSE IS THE PICK. Two seconds off the trigger buys four certain
// crits, which is a burst rather than a rate - it pays the player who taps
// and takes cover and pays nothing at all to one holding the trigger down.
export const id = 'trueStrike';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'TRUE STRIKE',
    max: 1,
    theme: 0xf06292,
    effects: [
      ['+10% CRIT DAMAGE', GOOD],
      ['HOLD FIRE 2s, THEN:', NOTE],
      ['NEXT 4 SHOTS CRIT', GOOD],
    ],
    apply: (mods, n) => {
      mods.critMult *= 1 + 0.1 * n;
      mods.trueStrikeWait = 2;
      mods.trueStrikeShots = 4 * n;
    },
}));

export const icon = [
  '........................',
  '........................',
  '..............222221....',
  '.............22222221...',
  '............2222002221..',
  '............2220000221..',
  '............2200330021..',
  '............2203330021..',
  '............2233300221..',
  '............2333002211..',
  '............433222211...',
  '...........422111111....',
  '..........422...........',
  '.........422............',
  '........422.............',
  '.42....422..............',
  '.232..422...............',
  '..234422................',
  '...4332.................',
  '...4332.................',
  '..422232................',
  '.422..232...............',
  '.22....22...............',
  '........22..............',
];
