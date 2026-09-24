import { definePassiveItem } from '../shared.js';

export const id = 'hellfire';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'HELLFIRE',
    max: 1,
    theme: 0xdd2c00,
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

export const icon = [
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '...........42...........',
  '...........42...........',
  '..........4432..........',
  '..........4332..........',
  '..........43332.........',
  '.........443322.........',
  '....2....43332..........',
  '...442...43332..........',
  '...4322.443332....42....',
  '..4432..4333332..4432...',
  '..4332..43333332.4322...',
  '.4433344433333334432....',
  '.433333333333333333342..',
  '.233332223333322233322..',
  '..43332..433332..4332...',
  '222333222233332222332221',
  '222222222222222222222221',
  '111111111111111111111111',
  '........................',
];
