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

// TWO TANKS, HALF FULL OF THE THING ITSELF. The reserve you can see: dark
// glass up top, the shield sloshing glowing in the bottom half, bubbles
// still rising off it, a balance pipe so neither side runs rich.
export const icon = [
  '........................',
  '........................',
  '....221..........221....',
  '...42221........42221...',
  '..2411112......2411112..',
  '..2411112.2332.2411112..',
  '..24111122233222411112..',
  '..2411112..21..2411112..',
  '..2411112......2411112..',
  '..2411112......2411112..',
  '..2411112......2411112..',
  '..2433342......2433342..',
  '..2333332......2334332..',
  '..2343332......2333332..',
  '..2333332......2333342..',
  '..2333432......2333332..',
  '..2333332......2333432..',
  '..2334332......2333332..',
  '..2333332......2333332..',
  '..2333332......2333332..',
  '..2332112......2332112..',
  '...11111........11111...',
  '........................',
  '........................',
];
