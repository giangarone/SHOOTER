import { definePassiveItem } from '../shared.js';

// ONE PER WAVE, at the moment the player is least able to go and look for a
// crate. It fires on the way DOWN through twenty, so it cannot be farmed by
// hovering there - the bar has to cross the line.
export const id = 'lastBreath';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'LAST BREATH',
    max: 1,
    theme: THEME.lastBreath,
    effects: [['DROP BELOW 20 HP:', NOTE], ['FULL AMMO RESERVE', GOOD], ['ONCE PER WAVE', NOTE]],
    apply: (mods, n) => { mods.lastBreath = 20 * n; },
}));
