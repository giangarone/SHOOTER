import { definePassiveItem } from '../shared.js';

// THE OTHER HAND. A reload is the one second in this game the gun does
// nothing at all, and this fills it: single rounds leave the muzzle at a
// fifth of the fire rate while the magazine is out, so a reload stopped
// halfway is still a gun - just the worst gun in the game.
//
// SINGLE ROUNDS, not the volley: the point is that the trigger still answers
// during the dead second, and a full pattern from a half-loaded magazine
// would make the reload the strongest state to fight from rather than the
// weakest. The cost is the rate and the one round it spends.
export const id = 'southpaw';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'SOUTHPAW',
    max: 1,
    theme: THEME.southpaw,
    effects: [
      ['YOU CAN STILL FIRE', GOOD],
      ['WHILE RELOADING, AT', NOTE],
      ['20% FIRE RATE', NOTE],
    ],
    apply: (mods, n) => { mods.southpawRate = 0.2 * n; },
}));

export const icon = [
  '........................',
  '........................',
  '.........1..............',
  '........21..............',
  '......22221.............',
  '....22222221............',
  '..1222222221............',
  '...1200022221...........',
  '....1000200221..........',
  '.....2022002221.........',
  '.....1222002000.........',
  '......1222220001........',
  '.......2222220211.......',
  '.......122222111..22221.',
  '........122111....22221.',
  '.........111......22221.',
  '.........1........22221.',
  '..................22221.',
  '..................22221.',
  '..................22211.',
  '..................4332..',
  '..................2322..',
  '...................22...',
  '........................',
];
