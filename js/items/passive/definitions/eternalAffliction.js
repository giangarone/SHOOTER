import { definePassiveItem } from '../shared.js';

export const id = 'eternalAffliction';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'ETERNAL AFFLICTION',
    max: 1,
    theme: THEME.affliction,
    // The drafted drawback was "status effects on you last twice as long", and
    // the player has no status effects - only hazard zones to stand out of. So
    // the cost lands on those instead, which is the same idea in the vocabulary
    // the game actually has.
    effects: [['STATUS ON ENEMIES', GOOD], ['NEVER EXPIRES', NOTE], ['POOLS & LAVA HURT YOU 2x', BAD]],
    apply: (mods, n) => {
      mods.statusEternal = n;
      mods.hazardMult *= 2;
    },
}));
