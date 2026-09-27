import { definePassiveItem } from '../shared.js';

export const id = 'ferryman';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'FERRYMAN',
    max: 1,
    theme: 0x8d9bb5,
    // The rat's mirror, pointed at the bar that keeps you alive - and worth
    // more, because the drop roll withholds health on a full bar (see
    // rollDrop in js/powerups.js): what lies on the floor is almost always a
    // crate the player could not stop fighting for. One plate at a time,
    // GLIDED back to your feet, never collected by the pet.
    effects: [['A PET FERRYMAN', GOOD], ['BRINGS HEALTH PLATES', GOOD], ['TO YOUR FEET', NOTE]],
    apply: (mods, n) => { mods.ferryman = n; },
}));

// The little ferryman, mist and lamplight: a hooded robe flaring to a hem
// with tatters, a void for a face with two motes in it, the pole held off to
// the side and the lantern hung from it burning bright - the one warm thing
// in the drawing, because it is the lamp your health comes home by.
export const icon = [
  '........................',
  '........................',
  '........................',
  '........................',
  '.................2......',
  '..........2222..2.......',
  '.........244221.2.......',
  '.........220022.2.......',
  '.........224042.2.......',
  '..........2112.2........',
  '........42222221.2......',
  '........22222221.2......',
  '.......4222222212.......',
  '.......222222221.2......',
  '......2222222221.2......',
  '......2222222221.232....',
  '.....22222222221.234....',
  '.....12222222221.212....',
  '.....212222222211.1.....',
  '....12121212121111......',
  '.....1..1...1..1.1......',
  '........................',
  '........................',
  '........................',
];