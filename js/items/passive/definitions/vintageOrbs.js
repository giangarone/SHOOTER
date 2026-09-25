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
  '........................',
  '........................',
  '..........44441.........',
  '........444242241.......',
  '......4442422222241.....',
  '.....442422202222221....',
  '.....424222202222221....',
  '....44223222022222221...',
  '....42232222022022221...',
  '...4422222020222222221..',
  '...4222222224222222221..',
  '...4222222244422222221..',
  '...4222222224002222221..',
  '...1222220222220022211..',
  '....42222222222223221...',
  '....12222222222222211...',
  '.....422222222233221....',
  '.....122222222422211....',
  '......1122222222111.....',
  '........112222111.......',
  '..........11111.........',
  '........................',
  '........................',
];
