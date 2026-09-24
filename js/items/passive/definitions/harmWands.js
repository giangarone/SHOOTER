import { definePassiveItem } from '../shared.js';

// FATAL RESERVE'S SHAPE, IN RATE. The bottom of the magazine, read off the
// count the TRIGGER saw rather than the live one for exactly the reason that
// pick is - see Player.magAtShot and the note in _resolveHit. Fifteen is
// most of a default magazine and all of a HOLLOW POINT one, which is the
// point: what it rewards is shooting the magazine dry instead of topping up.
export const id = 'harmWands';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'HARM WANDS',
    max: 1,
    theme: THEME.harmWands,
    effects: [['LAST 15 ROUNDS OF', NOTE], ['EACH MAG: +50% FIRE RATE', GOOD]],
    apply: (mods, n) => { mods.harmWands = 15 * n; mods.harmWandsRate = 0.5 * n; },
}));

export const icon = [
  '........................',
  '........................',
  '......2222222221........',
  '......2222222221........',
  '......1222222211........',
  '.......22222221.........',
  '.......20000001.........',
  '.......20000001.........',
  '.......22222221.........',
  '.......20000001.........',
  '.......20000001.........',
  '.......22222221.........',
  '.......22222221.444442..',
  '.......233333312222222..',
  '.......22222221.........',
  '.......22222221.444442..',
  '.......233333312222222..',
  '.......22222221.........',
  '.......22222221.444442..',
  '.......233333312222222..',
  '.......22222221.........',
  '.......11111111.........',
  '........................',
  '........................',
];
