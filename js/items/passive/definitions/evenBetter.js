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
  '.....4............4.....',
  '.......44......44.......',
  '....4..43......43..4....',
  '......4221....4221......',
  '......4221....4221......',
  '......2332....2332......',
  '......2332....2332......',
  '......2411....2411......',
  '......2332.4..2332......',
  '......2332.33.2332......',
  '......2332....2332......',
  '......2411....2411......',
  '......2332..4.2332......',
  '......2332.33.2332......',
  '......2332....2332......',
  '......2411....2411......',
  '......2332....2332......',
  '......2111....2111......',
  '.....42222222222222.....',
  '.....11111111111111.....',
  '........................',
  '........................',
  '........................',
];
