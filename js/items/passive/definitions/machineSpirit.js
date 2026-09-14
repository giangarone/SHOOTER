import { definePassiveItem } from '../shared.js';

// ---- THE SECOND POOL ----------------------------------------------------
//
// Forty-one more max-1 picks, and what holds them together is that almost
// every one of them names a MOMENT rather than a number: the first round out
// of a magazine, the second before you fired, the fourth shot, the beat, the
// frame you were hit on, the wave boundary. The pool above is mostly "how
// much"; this is mostly "when", which is the axis a player can actually play
// around once they have learnt it.
//
// EVERY ONE OF THEM WEIGHS ITSELF. A free passive item in a flat draw is a totem
// the player never has to think at, so the ones that are simply strong -
// Heavy Hand, Blood Oath, Bone Marrow, Gray Matter - are sold for something
// the build actually wanted, and the ones that are conditional are the ones
// allowed to be unconditionally good inside their condition.

// ---- RATE OF FIRE -------------------------------------------------------

// THE TRIGGER THAT LEARNS TO BE HELD, and the exact opposite of every other
// rate pick in the pool: those pay from the first round and this one pays
// nothing for the first second. Ten seconds of held trigger is the ceiling,
// which is longer than any magazine this gun has - so the cap is a thing a
// build reaches by never letting go, not a number it sits at.
export const id = 'machineSpirit';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'MACHINE SPIRIT',
    max: 1,
    theme: THEME.machineSpirit,
    effects: [['HOLD THE TRIGGER:', NOTE], ['+5% FIRE RATE/s', GOOD], ['UP TO +50%', NOTE]],
    apply: (mods, n) => {
      mods.spiritStep = 0.05 * n;
      mods.spiritMax = 0.5 * n;
    },
}));
