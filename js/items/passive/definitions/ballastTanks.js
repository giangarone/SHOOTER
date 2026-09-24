import { definePassiveItem } from '../shared.js';

// ---- the shield, which now has a bar of its own to be read on -----------

// FIFTY POINTS, EVERY WAVE, AND NO CLOCK ON THEM. A shield point is better
// than a health point - takeDamage spends the shield FIRST and fully, so a
// hit that breaks it does not carry the remainder through - which means fifty
// of these eats one arbitrarily large blow as well as fifty small ones. On a
// hundred-point bar that is half a life handed over at the top of every
// fight.
//
// WHAT PAYS FOR IT IS THAT IT DOES NOT COMPOUND. It is SET to fifty at every
// wave, not added, so a wave cleared without being touched banks nothing - the
// player who needs it gets all of it and the player who does not gets
// nothing, which is the same shape the relief drop and the need curve have.
//
// A FLOOR AND NOT A WRITE, though: a run also holding SECOND SKIN can carry
// more than fifty into a wave and keeps it. See Player.armWaveGrants.
export const id = 'ballastTanks';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'BALLAST TANKS',
    max: 1,
    theme: 0x2ab7d6,
    effects: [['START EACH WAVE', NOTE], ['WITH A 50 SHIELD', GOOD]],
    apply: (mods, n) => { mods.waveShield = 50 * n; },
}));

export const icon = [
  '....222221....222221....',
  '...22222221..22222221...',
  '...22222221..22222221...',
  '...222222221.222222221..',
  '...222222221.222222221..',
  '...222222221.222222221..',
  '...222222221.222222221..',
  '...223333321.223333321..',
  '...223333321.223333321..',
  '...223333321.223333321..',
  '...223333321.223333321..',
  '..000000000000000000000.',
  '..000000000000000000000.',
  '...223333321.223333321..',
  '...223333321.223333321..',
  '...223333321.223333321..',
  '...223333321.223333321..',
  '...223333321.223333321..',
  '...223333321.223333321..',
  '...223333321.223333321..',
  '...223333321.223333321..',
  '...223333311.223333311..',
  '...12222211..12222211...',
  '....111111....111111....',
];
