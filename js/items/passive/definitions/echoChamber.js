import { definePassiveItem } from '../shared.js';

// A FREE ROUND EVERY FOURTH TRIGGER PULL, at half strength and off no
// magazine. Counted per SHOT and not per pellet, the rule every other
// per-shot pick in the pool follows.
export const id = 'echoChamber';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'ECHO CHAMBER',
    max: 1,
    theme: 0xffcc80,
    effects: [['EVERY 4th SHOT FIRES', GOOD], ['A HALF-DMG ECHO', NOTE], ['THAT COSTS NO AMMO', GOOD]],
    apply: (mods, n) => {
      mods.echoEvery = 4;
      mods.echoDamage = 0.5 * n;
    },
}));

// THREE ARCHES, ONE ROUND, FOUR TALLIES. The chamber the echo bounces in,
// the shot walking into it, and the count that earns the free one.
export const icon = [
  '........................',
  '........................',
  '........................',
  '......4.................',
  '......22................',
  '........22..............',
  '.....22..2..............',
  '......22..2.............',
  '....33.22.2.............',
  '.....33.2..2............',
  '......3.2..2...3........',
  '4233..3.2..2.....2.1....',
  '......3.2..2....3.......',
  '.....33.2..2............',
  '....33.22.2.............',
  '......22..2.............',
  '.....22..2..............',
  '........22..............',
  '......22................',
  '......1.................',
  '........................',
  '.......4.4.4.4..........',
  '.......1.1.1.1..........',
  '........................',
];
