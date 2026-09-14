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
