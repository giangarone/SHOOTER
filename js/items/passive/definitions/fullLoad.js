import { definePassiveItem } from '../shared.js';

// THE AMMO STATION, FOR FREE, ONCE A WAVE. What it really buys is the
// DECISION it removes: the reserve is one of two things a player walks into a
// shop meaning to fix, and a run holding this can spend the whole balance on
// the other one.
//
// AT THE CLEAR AND NOT AT THE OPEN, which matters more than it looks: the
// shop happens between the two, so filling at the clear means the money saved
// is money the player has while the stations are standing. Filled at the open
// it would arrive after the only moment it could have changed a purchase.
//
// THE MAGAZINE TOO. "Refill your ammo to maximum" is what the card says, and
// a player who read that and then had to stand through a reload at the top of
// the next wave would be right to call it broken. It is the one place in the
// game the magazine is topped up for free - a FLAWLESS resupply deliberately
// does not (see Player.resupply), because that one is a reward for a wave
// taken perfectly and this is the whole of what the pick does.
export const id = 'fullLoad';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'FULL LOAD',
    max: 1,
    theme: THEME.fullLoad,
    effects: [['AMMO REFILLED AT', GOOD], ['EVERY WAVE END', NOTE]],
    apply: (mods, n) => { mods.fullLoad = n; },
}));

export const icon = [
  '........................',
  '........................',
  '........................',
  '..444444444444444444442.',
  '..433333333333333333332.',
  '..222222222222222222222.',
  '........................',
  '...22221..22221..22221..',
  '...22221..22221..22221..',
  '...22221..22221..22221..',
  '...22221..22221..22221..',
  '...22221..22221..22221..',
  '...22221..22221..22221..',
  '...22221..22221..22221..',
  '...22221..22221..22221..',
  '...12211..12211..12211..',
  '....432....432....432...',
  '....432....432....432...',
  '....432....432....432...',
  '....222....222....222...',
  '.....2......2......2....',
  '.....2......2......2....',
  '........................',
  '........................',
];
