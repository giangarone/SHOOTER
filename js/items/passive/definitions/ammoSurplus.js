import { definePassiveItem } from '../shared.js';

export const id = 'ammoSurplus';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'AMMO SURPLUS',
    max: 1,
    theme: THEME.ammoSurplus,
    effects: [['AMMO PICKUPS GIVE', NOTE], ['30% MORE ROUNDS', GOOD]],
    apply: (mods, n) => { mods.ammoPickupMult = 1 + 0.3 * n; },
}));
