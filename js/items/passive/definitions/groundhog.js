import { definePassiveItem } from '../shared.js';

export const id = 'groundhog';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'GROUNDHOG',
    max: 1,
    theme: THEME.groundhog,
    // THE THIRD THING CROUCHING IS FOR. It already buys a smaller target and,
    // with CROUCHFIRE, a faster trigger; this makes it the posture you reload
    // in as well, which is the one moment in a fight the player is doing
    // nothing else anyway. Down behind a box, magazine out, taking a fifth
    // less from whatever is still shooting at you - that is a whole way of
    // playing a wave, assembled out of three picks that each read as small.
    //
    // A SLIDE IS NOT A CROUCH, on the same terms Crouchfire draws the line: a
    // slide is a way of MOVING, it is entered out of a sprint and it ends
    // itself, and a slide that also took a fifth less damage would be the best
    // way to cross a room under fire. The stance is what is being paid for.
    effects: [['WHILE CROUCHED:', NOTE], ['TAKE 20% LESS DAMAGE', GOOD], ['RELOAD 20% FASTER', GOOD]],

    apply: (mods, n) => {
      mods.crouchGuard = Math.min(0.9, 0.2 * n);
      mods.crouchReload = Math.min(0.9, 0.2 * n);
    },
}));
