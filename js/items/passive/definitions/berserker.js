import { definePassiveItem } from '../shared.js';

export const id = 'berserker';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'BERSERKER',
    max: 2,
    theme: THEME.rage,
    // Deliberately no numbers: the shape of the deal is the whole pick, and a
    // percentage that only pays at an HP the player is trying not to be at
    // told them less than the sentence does.
    effects: [
      ['LOW HEALTH =', NOTE],
      ['MORE DAMAGE DEALT', GOOD],
    ],
    apply: (mods, n) => { mods.berserk += 0.5 * n; },
}));
