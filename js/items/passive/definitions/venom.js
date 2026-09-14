import { definePassiveItem } from '../shared.js';

// ---- PASSIVE ITEMS -------------------------------------------------------
// Single-tier picks: max 1, no levels, one distinct behaviour each. Where
// every passive item above answers "how much", these answer "what happens" - the
// player should be able to name what a passive item does from watching one
// shot land, without reading the totem twice.
//
// The ones that afflict an enemy all have to SAY SO ON THE ENEMY. A status
// the player cannot see is a stat increase with extra steps, so each drives
// a body tint and a particle drip (see STATUS_TINT in enemies/shared.js) and the
// colours are held distinct from each other and from the hit flash.
export const id = 'venom';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'VENOM ROUNDS',
    max: 1,
    theme: THEME.poison,
    // THE POISON IS AS STRONG AS THE GUN, and it ticks on the beat - once a
    // beat, where fire ticks twice. See Player.dotHit and Enemy._tickStatus.
    // No number in the text on purpose: the tick is one of the player's own
    // shots, which is a moving figure, and printing whatever it happens to be
    // on wave 1 would be a lie for the rest of the run.
    effects: [['SHOTS POISON ENEMIES', GOOD], ['POISON LASTS 4s', NOTE]],
    apply: (mods, n) => {
      mods.poisonPower = 1 * n;
      mods.poisonTime = 4 * n;
    },
}));
