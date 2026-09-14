import { definePassiveItem } from '../shared.js';

// ONE HEAL, AND IT IS THIS ONE. A point a second forever, and every other
// source in the game - crates, Vampiric, Blood Pact, the item pool's four
// heals, the leech - does nothing at all. It is the strongest slow heal there
// is and it makes the entire health economy stop applying to you.
export const id = 'healthyCore';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'HEALTHY CORE',
    max: 1,
    theme: THEME.healthyCore,
    effects: [['REGEN 1 HP/s, ALWAYS', GOOD], ['ALL OTHER HEALING OFF', BAD]],
    apply: (mods, n) => { mods.coreRegen = 1 * n; mods.healBlock = n; },
}));
