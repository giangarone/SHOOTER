import { definePassiveItem } from '../shared.js';

// VENOMGRID'S TWIN, IN FIRE, and the two are deliberately the same pick
// wearing different damage: fire is short and fierce where poison is long and
// shallow (see the note at the top of status.js), so which of them a run is
// offered changes what its sentries are FOR - a poison grid wears a boss down
// and a burning one clears a crowd.
export const id = 'hellspitter';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'HELLSPITTER',
    max: 1,
    theme: THEME.hellspitter,
    effects: [['YOUR TURRETS IGNITE', GOOD], ['WHAT THEY HIT', NOTE]],
    apply: (mods, n) => { mods.turretBurn = 1 * n; mods.turretBurnTime = 3; },
}));
