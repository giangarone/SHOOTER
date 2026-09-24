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

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'TENDERIZER',
    max: 1,
    theme: 0xbb3f20,
    effects: [['+50% DAMAGE TO', GOOD], ['ENEMIES AT FULL HP', NOTE]],
    apply: (mods, n) => { mods.tenderizer = 0.5 * n; },
}));

// THE MALLET. The wide flat head and the short handle - the kitchen tool
// that exists to make the first swing count. Hammered tooth texture across
// the face, a collared neck and a ring-wrapped grip below.
export const icon = [
  '........................',
  '........................',
  '.....44444442222222.....',
  '.....44343434343431.....',
  '.....43131313131311.....',
  '.....44343434343431.....',
  '.....43131313131311.....',
  '.....44343434343431.....',
  '.....43131313131311.....',
  '.....11111111111111.....',
  '.........233332.........',
  '.........211112.........',
  '..........3221..........',
  '..........3221..........',
  '..........3001..........',
  '..........3221..........',
  '..........3221..........',
  '..........3001..........',
  '..........3221..........',
  '..........3221..........',
  '.........433331.........',
  '.........211111.........',
  '........................',
  '........................',
];
