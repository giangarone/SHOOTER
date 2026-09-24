import { definePassiveItem } from '../shared.js';

// PERMANENT MAX HP, on the same flawless flag No-Hit Bonus reads. The two
// are deliberately different rewards for one piece of play: that one makes
// the gun better and can be lost by a single hit, this one banks something
// no later wave can take back. Capped so a long clean run cannot simply
// outgrow the arena - twenty flawless waves is the target.
export const id = 'untouched';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'UNTOUCHED',
    max: 1,
    theme: THEME.temper,
    effects: [['CLEAR A WAVE WITHOUT', NOTE], ['BEING HIT: +3 MAX HP', GOOD], ['PERMANENT, UP TO +60', NOTE]],
    apply: (mods, n) => {
      mods.hpPerCleanWave = 3 * n;
      mods.hpBankCap = Math.max(mods.hpBankCap, 60 * n);
    },
}));

export const icon = [
  '..................42....',
  '..................42....',
  '...............44443442.',
  '...............43333332.',
  '...............23333322.',
  '................223321..',
  '................223321..',
  '................222221..',
  '................222221..',
  '................222221..',
  '.........2222222222221..',
  '.........2222222222221..',
  '.........2222222222221..',
  '.........2222222222221..',
  '..22222222222222222221..',
  '..22222222222222222221..',
  '..22222222222222222221..',
  '..22222222222222222221..',
  '..22222222222222222221..',
  '..22222222222222222221..',
  '..22222222222222222221..',
  '..22222222222222222221..',
  '..11111111111111111111..',
  '........................',
];
