import { definePassiveItem } from '../shared.js';

// ---- the floor, and what is lying on it ---------------------------------

// MONEY THAT AGES WELL. A percent a second against ORB_LIFETIME's twenty is a
// ceiling of +20%, reached by an orb nobody touched for the whole of its life
// - so the pick is small, certain, and completely unfarmable, which is the
// only shape a "leave it there" reward can honestly have.
//
// THE EXPLOIT IT IS PRICED AGAINST is hoarding, and it does not pay: an orb
// left more than twenty seconds is GONE, credits and all. A player holding
// back to ripen the floor is burning whole orbs to earn a fifth of the ones
// that survive. What it actually pays for is the money that was ALREADY going
// to sit there - the far side of the arena during a fight the player cannot
// leave - which is money that used to be worth nothing extra at all.
export const id = 'vintageOrbs';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'VINTAGE ORBS',
    max: 1,
    theme: 0xd9c26b,
    effects: [['ORBS GAIN +1% VALUE', GOOD], ['PER SECOND UNCOLLECTED', NOTE]],
    apply: (mods, n) => { mods.vintage = 0.01 * n; },
}));

export const icon = [
  '........................',
  '...........21...........',
  '.......2222222221.......',
  '......222222222221......',
  '.....22200022000221.....',
  '....2220000220000221....',
  '...222000002200000221...',
  '..22200000000000330221..',
  '..22000000000003330021..',
  '..22000000000033300021..',
  '..22000000033330000021..',
  '.2222220003333000222221.',
  '.1222220003333000222211.',
  '..22000000333000000021..',
  '..22000003330000000021..',
  '..22000003300000000021..',
  '..12200033000000000211..',
  '...122003302200000211...',
  '....1220000220000211....',
  '.....12200022000211.....',
  '......122222222211......',
  '.......1111211111.......',
  '...........11...........',
  '........................',
];
