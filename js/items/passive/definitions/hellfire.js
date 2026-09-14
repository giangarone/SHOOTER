import { definePassiveItem } from '../shared.js';

export const id = 'hellfire';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'HELLFIRE',
    max: 1,
    theme: THEME.hellfire,
    // Armed by the reload, the same signal Reload Burst and Breach Round ride,
    // so it pays a rhythm the player already has instead of asking for a new one.
    effects: [['RELOADS LEAVE A FIRE', GOOD], ['TRAIL FOR 3s', NOTE], ['BURNS WHAT WALKS IN', NOTE]],
    apply: (mods, n) => {
      // Sets fire, like every other fire in the game - see _updateFire.
      mods.hellfirePower = 1.5 * n;
      mods.hellfireTime = 3;
      mods.hellfireRadius = 1.8;
    },
}));
