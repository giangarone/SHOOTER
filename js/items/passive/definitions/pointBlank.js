import { definePassiveItem } from '../shared.js';

export const id = 'pointBlank';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'POINT BLANK',
    max: 1,
    theme: THEME.muzzle,
    // FIVE METRES IS INSIDE THE ARM'S REACH OF HALF THE ROSTER. That is the
    // whole deal: the bonus is only ever collected somewhere that is about to
    // cost health, which is what stops a flat +30% from being strictly better
    // than DARK POWER's +20% for free.
    //
    // A HARD EDGE HERE, where Longshot ramps, and the two are right for
    // opposite reasons. Longshot is about a slope the player rides; this is
    // about a LINE they either stepped over or did not, and the same five
    // metres is the number every melee reach in the game is already built
    // around - so it is a distance the player has learnt by being bitten at it.
    effects: [['+30% DAMAGE', GOOD], ['WITHIN 5m OF YOU', NOTE]],
    apply: (mods, n) => { mods.pointBlank = 0.3 * n; },
}));
