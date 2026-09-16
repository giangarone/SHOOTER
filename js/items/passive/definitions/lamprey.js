import { definePassiveItem } from '../shared.js';

export const id = 'lamprey';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'LAMPREY',
    max: 1,
    theme: THEME.lamprey,
    // TEN DAMAGE ON THE DOWNBEAT - once a beat, not twice. It used to bite on
    // every pulse, which is the half-beat edge the sentry guns and every fire
    // tick ride, and at ten a bite that made a free permanent companion worth
    // two bees. One bite a WHOLE beat is the rate the card always claimed and
    // it is the rate you can hear: the leech chews on the kick drum, so what
    // it is doing is legible without a damage number.
    //
    // The benchmark is still a bee's damage - except this one never expires and
    // never has to be paid for again. What balances that is REACH: a bee flies
    // forty metres at whatever it likes, and the leech only starts fights that
    // come within LAMPREY_RANGE of itself. It is a bodyguard, so it is only
    // ever worth anything when the fight has come to you - but what it catches
    // it keeps: walking away does not call it off, and a kill sends it onto
    // whatever is still standing nearby. Only an empty field brings it home.
    //
    // ON THE BEAT, like the turret, the sentry and every fire tick in the game.
    // Nothing rhythmic in this game runs on a private timer - see Music.pulse.
    effects: [['A PET LEECH FIGHTS', NOTE], ['BESIDE YOU', NOTE], ['KILLS HEAL YOU 2 HP', GOOD]],
    apply: (mods, n) => { mods.lamprey = n; },
}));
