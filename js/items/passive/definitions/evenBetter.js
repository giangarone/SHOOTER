import { definePassiveItem } from '../shared.js';

// ODD COUPLE'S OTHER HALF, and it is the same pick in every respect but the
// parity - same number, same reading of `magAtShot`, same page of the card.
// Two entries rather than one that asks which, because the JOKE is the point:
// whichever one the player is offered, the other is out there.
export const id = 'evenBetter';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'EVEN BETTER',
    max: 1,
    theme: 0x5f9ee8,
    effects: [['+20% DAMAGE', GOOD], ['WHEN THE MAGAZINE', NOTE], ['HOLDS AN EVEN COUNT', NOTE]],
    apply: (mods, n) => { mods.evenBetter = 0.2 * n; },
}));

export const icon = [
  '........................',
  '........................',
  '......2222222221........',
  '......2222222221........',
  '......1222222211........',
  '.......22222221.........',
  '.......22222221.........',
  '.......23333331.........',
  '.......23333331.........',
  '.......22222221.........',
  '.......23333331.........',
  '.......23333331.........',
  '.......22222221.........',
  '.......22222221.........',
  '.......22222221.........',
  '.......23333331.........',
  '.......23333331.........',
  '.......22222221.........',
  '.......23333331.........',
  '.......23333331.........',
  '.......22222221.........',
  '.......11111111.........',
  '........................',
  '........................',
];
