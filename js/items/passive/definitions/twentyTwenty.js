import { definePassiveItem } from '../shared.js';

export const id = 'twentyTwenty';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'TWENTY/TWENTY',
    max: 1,
    theme: THEME.precision,
    // The ammo line is the honest half of the deal and has to be on the card:
    // firing the pattern twice spends two rounds (see Player.shotCost), which
    // is what stops +20% net damage from being free. A 30-round magazine is a
    // 15-shot magazine with this taken, and that is the cost the player is
    // actually weighing.
    effects: [
      ['EVERY SHOT FIRES', GOOD],
      ['2 ROUNDS AT 60% DMG', NOTE],
      ['COSTS 2 AMMO PER SHOT', BAD],
    ],
    apply: (mods, n) => {
      mods.volley = 1 + n;
      mods.volleyDamage = 0.6;
    },
}));

export const icon = [
  '........................',
  '........................',
  '........................',
  '........................',
  '.............4444442....',
  '.............433333222..',
  '............24333322....',
  '..........211222222.....',
  '.........111............',
  '........11..............',
  '.11222211...............',
  '.1122221................',
  '.1122221................',
  '.11222221...............',
  '.111111111..............',
  '.........121............',
  '..........111...........',
  '............14444442....',
  '.............433333222..',
  '.............4333322....',
  '.............222222.....',
  '........................',
  '........................',
  '........................',
];
