import { definePassiveItem } from '../shared.js';

// ---- STAYING ALIVE -------------------------------------------------------

// NOTHING STICKS. Fire, poison, chill, fear, weakness and curse all simply
// fail to land - which is most of what the hazard-heavy themes have to say -
// and the price is on the other end of the same bar.
export const id = 'ironLung';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'IRON LUNG',
    max: 1,
    theme: THEME.ironLung,
    effects: [['IMMUNE TO ALL STATUS', GOOD], ['HEALING -30%', BAD]],
    apply: (mods, n) => {
      mods.statusImmune = n;
      mods.poisonImmune = n;
      mods.healMult *= Math.pow(0.7, n);
    },
}));
