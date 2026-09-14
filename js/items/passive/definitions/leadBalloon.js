import { definePassiveItem } from '../shared.js';

export const id = 'leadBalloon';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'LEAD BALLOON',
    max: 1,
    theme: THEME.ballast,
    // TWENTY-FIVE PERCENT IS A LOT, and the jump is a lot to give up. The
    // arena has catwalks, the boxes are cover you get ON as often as behind,
    // and half the enemies in the pool are answered by not being where they
    // are looking. This is the cursed pick that takes away a VERB rather than
    // a number, which is the only kind of drawback a player cannot stat their
    // way out of later in the run.
    //
    // IT DOES NOT TOUCH THE DASH, THE SLIDE OR A LEDGE. Everything the player
    // has for getting out of a corner still works, and one of them - the slide
    // - is the thing they will end up using instead. Taking the jump is meant
    // to change how the room is crossed, not to nail the player to the floor.
    effects: [['+25% DAMAGE', GOOD], ['JUMPING IS DISABLED', BAD]],
    apply: (mods, n) => {
      mods.damage *= 1 + 0.25 * n;
      mods.noJump = 1;
    },
}));
