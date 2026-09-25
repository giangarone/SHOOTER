import { definePassiveItem } from '../shared.js';

// THE FIGHT THAT HAS GONE ON TOO LONG. Uncapped, and it is the only pick in
// the pool that is - a boss fight ENDS, which is the ceiling, and a player
// who has been at one for two minutes is a player the boss is winning
// against. +2% every five seconds is 24% at a minute and 48% at two, so it
// never decides a fight that was going well and always decides one that was
// not.
//
// BOSSES ONLY. Read in _hitMult, which is the one place a hit knows what it
// landed ON - see the note there.
export const id = 'longHaul';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'LONG HAUL',
    max: 1,
    theme: 0xb03a2e,
    effects: [['VS BOSSES: +2% DAMAGE', GOOD], ['PER 5s OF FIGHT', NOTE], ['NO LIMIT', NOTE]],
    apply: (mods, n) => { mods.longHaulStep = 0.02 * n; mods.longHaulEvery = 5; },
}));

// THE FIGHT THAT WOULD NOT END, KEPT IN GLASS. Sand still falling, and the
// loop arrows around it: there is no bottom to this one.
export const icon = [
  '........................',
  '........................',
  '........................',
  '........44444444........',
  '.....4.4222222222.4.....',
  '........42222222........',
  '....4...22433322...4....',
  '........22333322........',
  '...........23...........',
  '...2.......1........2...',
  '...4.......33...........',
  '...........31...........',
  '...2................2...',
  '....................1...',
  '.........433333.........',
  '....1...42222221...1....',
  '........42222221........',
  '........42222221........',
  '........42222221........',
  '.......4222222222.......',
  '.......1111111111.......',
  '........................',
  '........................',
  '........................',
];
