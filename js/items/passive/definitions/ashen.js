import { definePassiveItem } from '../shared.js';

export const id = 'ashen';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'ASHEN',
    max: 1,
    theme: THEME.ember,
    // A lingering ZONE, not another instant blast: Blast Corpse and
    // Crystallize already own that shape, and a cloud you have to push enemies
    // through plays differently from a puff you never see.
    // A CHANCE rather than a certainty. Once Incendiary is running, every
    // burning enemy in a wave dies burning, and a cloud per corpse buried the
    // arena in ash: the zones stopped being places the player had to steer
    // enemies into and became the floor. At 15% a cloud is an event again.
    effects: [['15% OF BURNING DEAD', NOTE], ['LEAVE A FIRE CLOUD, 4s', GOOD], ['BURNS WHAT STANDS IN IT', NOTE]],
    apply: (mods, n) => {
      // A cloud SETS FIRE to what stands in it rather than dealing its own
      // damage - see _updateAsh. One number, one system: every point of fire
      // damage in the game is a burn tick now.
      mods.ashPower = 1 * n;
      mods.ashRadius = 3.5;
      mods.ashTime = 4;
      mods.ashChance = 0.15;
    },
}));
