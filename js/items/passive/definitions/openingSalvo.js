import { definePassiveItem } from '../shared.js';

// TEN SECONDS OFF THE TOP OF EVERY WAVE with no magazine to think about -
// no rounds spent, no reload, nothing to count. It pays the opening, which
// is the part of a wave the player has the most control over, and the -5%
// is charged for the whole rest of it.
//
// It says so on the HUD. A window that is silently open and silently shut
// is a stat the player can only infer from an ammo counter that stopped
// moving, so it wears a chip with a timer like every other window in the
// game - see setBuffs in ui.js.
export const id = 'openingSalvo';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'OPENING SALVO',
    max: 1,
    theme: THEME.salvo,
    effects: [['FIRST 10s OF EACH', NOTE], ['WAVE: SHOTS ARE FREE', GOOD], ['DAMAGE -5%', BAD]],
    apply: (mods, n) => {
      mods.salvoTime = 10 * n;
      mods.damage *= Math.pow(0.95, n);
    },
}));
