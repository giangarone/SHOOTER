import { definePassiveItem } from '../shared.js';

// THE STANCE IS THE STAT. Crouchfire and Cheekweld already ask the player to
// choose a posture; this asks the harder question, because hip-fire is the
// inaccurate half of the gun (see `spread` on the pulse rifle) and doubling
// the rate of a spray is only worth something at a range the spray can hold.
export const id = 'hipshot';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'HIPSHOT',
    max: 1,
    theme: 0xffb74d,
    effects: [['2x FIRE RATE', GOOD], ['WHILE HIP FIRING', NOTE], ['HALF RATE WHILE AIMING', BAD]],
    apply: (mods, n) => { mods.hipshot = n; },
}));

export const icon = [
  '.....2221...............',
  '...222222200............',
  '..2211112000............',
  '..211...0001............',
  '.211...000121...........',
  '.21...000..21...........',
  '.21..000...21...........',
  '.21.000....21...........',
  '.12000....211...........',
  '..000....221............',
  '..0022222211............',
  '..011121111.............',
  '......11................',
  '...................442..',
  '.................44222..',
  '...............44222....',
  '............444432......',
  '..222222224443333344442.',
  '..222222223333322222322.',
  '..12211111112232....22..',
  '...221........2342......',
  '...221.........22342....',
  '...221...........22342..',
  '...111.............222..',
];
