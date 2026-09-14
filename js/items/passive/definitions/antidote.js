import { definePassiveItem } from '../shared.js';

export const id = 'antidote';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'ANTIDOTE',
    max: 1,
    theme: THEME.antidote,
    effects: [['IMMUNE TO POISON', GOOD], ['HEAL 1 HP/s PER', GOOD], ['POISONED ENEMY NEARBY', NOTE]],
    apply: (mods, n) => {
      mods.poisonImmune = n;
      mods.poisonLeech = 1 * n;
    },
}));
