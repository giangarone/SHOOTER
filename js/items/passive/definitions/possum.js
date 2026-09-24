import { definePassiveItem } from '../shared.js';

// PLAYING DEAD. Below an eighth of the bar the room stops seeing you at all
// for ten seconds - the ORGAN GRINDER's trick, but the player's own body is
// the decoy and there is nothing to shoot instead. It buys the one thing a
// dying run actually needs, which is ten seconds of nobody swinging at it,
// and it can only be played again once the bar has been brought ALL the way
// back to the top - a second window costs the whole health bar the first one
// nearly spent.
//
// ROUNDS ALREADY IN THE AIR ARE NOT RECALLED, on the monkey's terms: a
// bullet does not know who it was for, and wandering through one is the one
// fair way the trick can still cost you.
export const id = 'possum';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'POSSUM',
    max: 1,
    theme: THEME.possum,
    effects: [
      ['BELOW 15% HEALTH:', NOTE],
      ['ENEMIES IGNORE YOU, 10s', GOOD],
      ['RECHARGES AT FULL HP', NOTE],
    ],
    apply: (mods, n) => { mods.possumAt = 0.15 * n; mods.possumTime = 10 * n; },
}));

export const icon = [
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '.....2221...............',
  '....243332222221........',
  '....23323222222221......',
  '....222222222222221..21.',
  '....1222222222222211111.',
  '.....12222222222211...1.',
  '......111222221111......',
  '.........222221.........',
  '.........0000000000.....',
  '........................',
  '........................',
  '........................',
  '........................',
];
