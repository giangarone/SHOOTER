import { definePassiveItem } from '../shared.js';

// THE RED END OF THE STAMINA BAR, WHICH NOTHING HAS EVER PAID FOR. It is the
// one meter in the game a player only ever sees as a punishment - the lockout
// that refuses the next sprint - and this makes the bottom of it the best the
// gun ever is. The line is the LOCKOUT's own (see Player.staminaLow), so the
// window the card describes is exactly the red the HUD draws.
export const id = 'runningOnFumes';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'RUNNING ON FUMES',
    max: 1,
    theme: THEME.runningOnFumes,
    effects: [['+100% DAMAGE,', GOOD], ['+50% FIRE RATE', GOOD], ['WHILE STAMINA IS RED', NOTE]],
    apply: (mods, n) => { mods.fumesDamage = 1.0 * n; mods.fumesRate = 0.5 * n; },
}));
