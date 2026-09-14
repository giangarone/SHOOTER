import { definePassiveItem } from '../shared.js';

// ONE BODY, HIT AND HIT AND HIT. It is Telltale's rhythm turned into a ramp
// and it asks for the hardest thing in the game: staying on one target while
// the room moves. Switching targets is what breaks it, not missing alone.
export const id = 'luckyStreak';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'LUCKY STREAK',
    max: 1,
    theme: THEME.luckyStreak,
    effects: [['+5% CRIT CHANCE PER HIT', GOOD], ['ON THE SAME ENEMY', NOTE], ['MISS OR SWITCH: RESET', BAD]],
    apply: (mods, n) => { mods.luckyStep = 0.05 * n; },
}));
