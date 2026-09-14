import { definePassiveItem } from '../shared.js';

export const id = 'ammoHoarder';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'AMMO HOARDER',
    max: 1,
    theme: THEME.hoard,
    // It is the only passive item that touches reserve CAPACITY rather than
    // reserve income, which is what makes it worth a slot
    // next to Scavenger and Ammo Fabricator instead of competing with them.
    effects: [['2x AMMO RESERVE', GOOD], ['300 \u2192 600 ROUNDS', NOTE]],
    apply: (mods, n) => { mods.reserveMult = 1 + n; },
}));
