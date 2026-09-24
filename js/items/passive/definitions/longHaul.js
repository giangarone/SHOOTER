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

export const icon = [
  '........................',
  '...2222222222222222221..',
  '...1122222222222221111..',
  '.....12222222222211.....',
  '......200000000001......',
  '......100000000001......',
  '.......1000000001.......',
  '........20000001........',
  '........12000011........',
  '.........120011.........',
  '..........2001..........',
  '..........2221..........',
  '..........2221..........',
  '..........2331..........',
  '.........223321.........',
  '........22333321........',
  '........23333331........',
  '.......2433333331.......',
  '......243333333331......',
  '......233333333331......',
  '.....22222222222221.....',
  '....2222222222222221....',
  '...2222222222222222221..',
  '...1111111111111111111..',
];
