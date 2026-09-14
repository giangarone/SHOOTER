import { definePassiveItem } from '../shared.js';

// EVERY WAVE OPENS AT FIFTY, up OR down. It is a floor for a run that is
// losing and a ceiling for one that is winning, and the healing bonus is what
// decides which: fifty and a 1.5x heal is a hand back into the fight, and
// fifty out of two hundred is a wave you have to earn back.
export const id = 'emergencyRations';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'EMERGENCY RATIONS',
    max: 1,
    theme: THEME.emergencyRations,
    effects: [['EACH WAVE STARTS YOU', NOTE], ['AT EXACTLY 50 HP', BAD], ['HEALING +50%', GOOD]],
    apply: (mods, n) => { mods.rations = 50; mods.healMult *= 1 + 0.5 * n; },
}));
