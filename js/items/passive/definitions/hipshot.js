import { definePassiveItem } from '../shared.js';

// THE STANCE IS THE STAT. Crouchfire and Cheekweld already ask the player to
// choose a posture; this asks the harder question, because hip-fire is the
// inaccurate half of the gun (see `spread` on the pulse rifle) and doubling
// the rate of a spray is only worth something at a range the spray can hold.
export const id = 'hipshot';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'HIPSHOT',
    max: 1,
    theme: THEME.hipshot,
    effects: [['2x FIRE RATE', GOOD], ['WHILE HIP FIRING', NOTE], ['HALF RATE WHILE AIMING', BAD]],
    apply: (mods, n) => { mods.hipshot = n; },
}));
