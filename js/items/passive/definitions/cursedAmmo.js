import { definePassiveItem } from '../shared.js';

export const id = 'cursedAmmo';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'CURSED AMMO',
    max: 1,
    theme: THEME.hex,
    // The floor is the whole reason this is playable: without it a held
    // trigger kills you from full health with no enemy in the room.
    effects: [['20% OF SHOTS: 2x DMG', GOOD], ['THEY COST 1 HP EACH', BAD], ['NEVER BELOW 1 HP', NOTE]],
    apply: (mods, n) => {
      mods.cursedChance = 0.2 * n;
      mods.cursedDamage = 1;
    },
}));
