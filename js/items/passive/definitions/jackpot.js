import { definePassiveItem } from '../shared.js';

// ONE HOP IN A HUNDRED PAYS FOR EVERYTHING. A jump is the cheapest thing the
// player does and the only verb in the game with no resource behind it, so
// this is the one pick that rewards a habit rather than a decision - and at
// 1% it lands perhaps twice a run, which is exactly often enough to be a
// thing that HAPPENS rather than a thing that is farmed.
//
// THE GROUND JUMP ONLY. The air jump is edge-triggered off a charge and a
// held key bunny-hops down a corridor at four hops a second; rolling on both
// would make a DOUBLE JUMP build's odds twice a plain one's for no reason
// anybody could read off the card. Active-wave combat only, because those same
// free hops would otherwise turn a safe shop into a guaranteed refill station.
export const id = 'jackpot';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'JACKPOT',
    max: 1,
    theme: THEME.jackpot,
    effects: [
      ['EACH GROUND JUMP:', NOTE],
      ['1% CHANCE OF FULL', GOOD],
      ['HP & AMMO', NOTE],
      ['IN COMBAT ONLY', NOTE],
    ],
    apply: (mods, n) => { mods.jackpot = 0.01 * n; },
}));

export const icon = [
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '.22222222222222222222221',
  '.22222222222222222222221',
  '.22000000200000020000001',
  '.22333330233333023333301',
  '.22333330233333023333301',
  '.22003300200330020033001',
  '.22003300200330020033001',
  '.22003300200330020033001',
  '.22033000203300020330001',
  '.22033000203300020330001',
  '.22033000203300020330001',
  '.22000000200000020000001',
  '.22000000200000020000001',
  '.22222222222222222222221',
  '.11122222222222222221111',
  '....22222222222222221...',
  '....11133333333332111...',
  '.......43333333332......',
  '.......22222222222......',
];
