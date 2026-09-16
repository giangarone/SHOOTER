import { definePassiveItem } from '../shared.js';

// THE FIRST HIT IS THE BIG ONE. Fifty percent against a body at FULL health,
// which is the whole shape of the pick: it pays on the opening shot of every
// fight and nothing after, so it rewards a build that SWITCHES targets
// rather than one that finishes what it started. It composes with ASSASSIN
// (the first-hit crit) deliberately - both are questions about an untouched
// body, and a run holding both has paid twice for the same opening.
//
// MEASURED BEFORE THE BLOW, exactly as OVERKILL reads `before`: the body
// either arrived at this hit full or it did not, and there is no half-full
// reading for a multiplier to drift into.
export const id = 'tenderizer';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'TENDERIZER',
    max: 1,
    theme: THEME.tenderizer,
    effects: [['+50% DAMAGE TO', GOOD], ['ENEMIES AT FULL HP', NOTE]],
    apply: (mods, n) => { mods.tenderizer = 0.5 * n; },
}));

// THE MALLET. The wide flat head and the short handle - the kitchen tool
// that exists to make the first swing count.
export const icon = [
  '........................',
  '........................',
  '.....222222222222.......',
  '....23333333333332......',
  '....23333333333332......',
  '....23333333333332......',
  '....23333333333332......',
  '....23333333333332......',
  '....22333333333322......',
  '.....2233333333222......',
  '......223333333222......',
  '.......22222222222......',
  '........22222222........',
  '.........22222..........',
  '.........22222..........',
  '.........22222..........',
  '.........22222..........',
  '.........22222..........',
  '.........22222..........',
  '.........22222..........',
  '.........22222..........',
  '........22222...........',
  '........2222............',
  '.......222..............',
];
