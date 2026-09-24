import { definePassiveItem } from '../shared.js';

// =========================================================================
// WHAT A HIT TAKEN IS WORTH
// =========================================================================
//
// Two picks that turn the health bar into a resource that pays out, and they
// pay in different currencies so a run can hold both without either being
// redundant. Both are hooked at ONE place - Game._hurtPlayer, after the
// dodge, the ward and every multiplier - so what they read is what the
// player actually lost, never what was thrown at them.
export const id = 'bloodMoney';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'BLOOD MONEY',
    max: 3,
    theme: THEME.tithe,
    // COMPENSATION, NOT AN INCENTIVE. Two credits a point at the first tier is
    // a fraction of what the same seconds spent killing would have paid, so
    // standing in a fire to farm it is strictly worse than not - which is the
    // only way a "get paid for being hurt" pick can be written without
    // becoming the optimal way to play. See the note above THORNS: the same
    // rule, one file over.
    //
    // It scales with the DAMAGE and not with the hit, so a tank's slam pays
    // like a tank's slam and a poison tick pays like a poison tick.
    effects: (n) => [
      ['EARN ' + step(n, (k) => '$' + 2 * k) + ' PER HP LOST', GOOD],
      ['PAID AS YOU TAKE IT', NOTE],
    ],
    apply: (mods, n) => { mods.bloodMoney += 2 * n; },
}));

export const icon = [
  '........................',
  '.......111111...........',
  '.....1112222111.........',
  '....112220002211........',
  '...11222200022211.......',
  '...12222200022221.......',
  '..1122222000222211......',
  '..1222000000000221......',
  '..1222000000000221......',
  '..1222222000222221......',
  '..1222000000000221......',
  '..1122000000000211......',
  '...12222200022221.2.....',
  '...11222200022211.2.....',
  '....112220002211..2.....',
  '.....1112000111..442....',
  '.......111111...44332...',
  '...............4433332..',
  '...............4333332..',
  '...............4333332..',
  '...............2333322..',
  '................22222...',
  '........................',
  '........................',
];
