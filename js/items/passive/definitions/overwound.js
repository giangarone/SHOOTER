import { definePassiveItem } from '../shared.js';

// Rate bought with the one thing a faster gun needs more of. A 1.4s reload
// becomes 2s, which is most of a second longer every thirty rounds - and the
// rate is spending those rounds faster, so the pick pays for itself twice
// and charges for itself twice.
export const id = 'overwound';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'OVERWOUND',
    max: 1,
    theme: THEME.overwound,
    effects: [['+40% FIRE RATE', GOOD], ['RELOADS 30% SLOWER', BAD]],
    apply: (mods, n) => {
      mods.fireRate *= 1 + 0.4 * n;
      mods.reloadMult *= Math.pow(1 / 0.7, n);
    },
}));
