import { definePassiveItem } from '../shared.js';

// THE BAR DOES NOT GET LONGER. Stamina is a rhythm - sprint, break, sprint -
// and a longer bar changes how long one sprint is rather than how often the
// rhythm comes round. Halving the drain and doubling the regen is the same
// budget spent on the part the player actually feels: it is the WAIT that a
// sprint build is paying, not the run.
export const id = 'secondWind';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'SECOND WIND',
    max: 1,
    theme: THEME.wind,
    effects: [['SPRINT TWICE AS LONG', GOOD], ['STAMINA BACK 2x FAST', GOOD]],
    apply: (mods, n) => {
      mods.staminaDrain *= Math.pow(0.5, n);
      mods.staminaRegen *= 1 + n;
    },
}));
