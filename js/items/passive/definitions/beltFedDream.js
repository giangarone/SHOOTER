import { definePassiveItem } from '../shared.js';

// NO MAGAZINE AT ALL. There is nothing to reload, nothing to run dry and
// nothing to time - the gun simply runs until the reserve does, at two rounds
// a shot. It is the biggest change to how the weapon FEELS in either pool,
// and what it costs is that the reserve is now the only number there is.
export const id = 'beltFedDream';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'BELT FED DREAM',
    max: 1,
    theme: THEME.beltFedDream,
    effects: [['NO MAGAZINE AT ALL:', GOOD], ['FIRES FROM RESERVE', NOTE], ['2 AMMO PER SHOT', BAD]],
    apply: (mods, n) => { mods.beltFedDream = n; mods.beltFedCost = 2; },
}));
