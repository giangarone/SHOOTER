import { definePassiveItem } from '../shared.js';

// ---- the butt of the rifle, three ways ----------------------------------

// TWICE THE REACH, AND THE REACH IS THE WHOLE MELEE PROBLEM. A swing is worth
// double at the kill and four times that under CROWBAR, and none of it ever
// mattered because 3.6 metres is close enough that a rusher has already hit
// you. Seven metres is the range a chaser is at when the player DECIDES to
// swing rather than the range it is at when they have run out of choices.
//
// A FRACTION OF MELEE_RANGE rather than a flat number of metres, so the reach
// still grows with the target the way the base one does - a boss two metres
// wide stays meleeable from outside its own surface.
export const id = 'longArm';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'LONG ARM',
    max: 1,
    theme: THEME.longArm,
    effects: [['2x MELEE REACH', GOOD]],
    apply: (mods, n) => { mods.meleeReach = 1 * n; },
}));

export const icon = [
  '........................',
  '........................',
  '........................',
  '........................',
  '.......1................',
  '...22221................',
  '.2222221................',
  '.2222221...........42...',
  '.222222222224444444432..',
  '.222222222222222222322..',
  '.222222111111......22...',
  '.2222221................',
  '.2222221................',
  '.2111111................',
  '.11.....................',
  '.............42.......42',
  '.............42.......42',
  '.............42.......42',
  '.............43444444442',
  '.............42222222232',
  '.............42.......42',
  '.............22.......22',
  '........................',
  '........................',
];
