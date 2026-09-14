import { definePassiveItem } from '../shared.js';

export const id = 'cheekweld';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'CHEEKWELD',
    max: 1,
    theme: THEME.cheekweld,
    // ARMOUR ON A POSTURE THAT USED TO BE ALL COST. Aiming already trades
    // movement for accuracy, which in a game about crowds is a trade the
    // player mostly declines - so the sights are the one thing in the control
    // scheme a build could ignore entirely. A fifth off every hit taken while
    // they are up is a reason to be standing there.
    //
    // READ LIVE OFF `aiming`, the same flag the gun's own raise rides, so it
    // arrives on the frame the button lands rather than at the end of the
    // half-second the weapon takes to come up. The player is protected by the
    // DECISION, not by the animation finishing.
    effects: [['TAKE 20% LESS DAMAGE', GOOD], ['WHILE AIMING', NOTE]],
    apply: (mods, n) => { mods.aimGuard = Math.min(0.9, 0.2 * n); },
}));
