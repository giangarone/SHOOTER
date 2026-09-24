import { definePassiveItem } from '../shared.js';

// CRITS THAT PAY FOR THEMSELVES, and ordinary rounds that pay for the crits.
// At the base 5% chance this is a straight ammunition tax; every crit pick in
// the pool above turns it the other way up, which is what makes it a pick for
// a build rather than a pick on its own.
export const id = 'criticalOverflow';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'CRITICAL OVERFLOW',
    max: 1,
    theme: 0xd81b8f,
    effects: [['CRITS: +50% DMG', GOOD], ['AND REFUND 1 AMMO', GOOD], ['NON-CRITS COST +1 AMMO', BAD]],
    apply: (mods, n) => {
      mods.critMult *= 1 + 0.5 * n;
      mods.critOverflow = n;
    },
}));

export const icon = [
  '........................',
  '.................2......',
  '.................2......',
  '................42......',
  '..............2443422...',
  '...............43322....',
  '.........2222224222.....',
  '.........22222222.22....',
  '.........2222222...2....',
  '.........2222221........',
  '.........2222221........',
  '.........2222221........',
  '...42....2222221........',
  '...4322..2222221........',
  '...422...2222221........',
  '...42....2222221........',
  '...232...2222221........',
  '....42...2222221........',
  '....232..1222211.2......',
  '.....42...12211..42.....',
  '.....2342..221.4422.....',
  '......223444334222......',
  '........22232222........',
  '...........22...........',
];
