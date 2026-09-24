import { definePassiveItem } from '../shared.js';

// A REFUND, NOT INCOME. Scavenger and Ammo Fabricator both make rounds out
// of nothing; this one only ever gives back what a shot that CONNECTED cost,
// so it pays accuracy rather than time spent holding the trigger. Rolled
// once per shot and refunding the whole shotCost, so a Triple Tap build gets
// three rounds back on the shots it wins - the refund is worth exactly what
// the trigger pull was.
export const id = 'brassEcho';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'BRASS ECHO',
    max: 3,
    theme: THEME.echo,
    effects: (n) => [
      ['HITS REFUND AMMO', GOOD],
      ['CHANCE ' + step(n, pctUp(5)), NOTE],
    ],
    apply: (mods, n) => { mods.ammoRefund = 0.05 * n; },
}));

export const icon = [
  '........................',
  '........................',
  '........................',
  '........................',
  '.........2442...........',
  '..........43344422221...',
  '.......44443223222221...',
  '.....44422322.2222221...',
  '....44222.22..2222221...',
  '....422.......2222221...',
  '...442........2222221...',
  '...422........2222221...',
  '...42.........2222221...',
  '..442.........2222221...',
  '..232.........2222211...',
  '...42.........222221....',
  '...432........222221....',
  '...232........122221....',
  '....432........22211....',
  '....23342......1221.....',
  '.....2222.......211.....',
  '.......2........11......',
  '........................',
  '........................',
];
