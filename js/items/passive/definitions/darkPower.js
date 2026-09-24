import { definePassiveItem } from '../shared.js';

export const id = 'darkPower';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'DARK POWER',
    max: 1,
    theme: 0xe53935,
    // The plainest entry in the pool: damage, no drawback, no condition. It
    // cost five max HP on the old paid row, and free it is still UNDER Hollow
    // Point - a common, at +30% a stack for a smaller magazine - so it needs
    // no rebalance to sit here. Not everything has to be a decision.
    effects: [['+20% DAMAGE', GOOD]],
    apply: (mods, n) => { mods.damage *= 1 + 0.2 * n; },
}));

export const icon = [
  '........................',
  '........................',
  '...221..1...............',
  '...431..121...1.........',
  '...231...421..221.......',
  '....421..421..231.......',
  '....421..231...421......',
  '....431...421..421......',
  '....1321..421..231......',
  '.....421..431...421.....',
  '.....431..1321..421.....',
  '.....131...421..231.....',
  '......421..431..1321....',
  '......431..1321..431....',
  '......231...421..231....',
  '......1321..231..1321...',
  '.......421..231...431...',
  '.......231..1321..231...',
  '.......231...231..1321..',
  '.......1321..221...111..',
  '........211..111...1....',
  '........11..............',
  '........................',
  '........................',
];
