import { definePassiveItem } from '../shared.js';

export const id = 'groundhog';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'GROUNDHOG',
    max: 1,
    theme: 0x795548,
    // THE THIRD THING CROUCHING IS FOR. It already buys a smaller target and,
    // with CROUCHFIRE, a faster trigger; this makes it the posture you reload
    // in as well, which is the one moment in a fight the player is doing
    // nothing else anyway. Down behind a box, magazine out, taking a fifth
    // less from whatever is still shooting at you - that is a whole way of
    // playing a wave, assembled out of three picks that each read as small.
    //
    // A SLIDE IS NOT A CROUCH, on the same terms Crouchfire draws the line: a
    // slide is a way of MOVING, it is entered out of a sprint and it ends
    // itself, and a slide that also took a fifth less damage would be the best
    // way to cross a room under fire. The stance is what is being paid for.
    effects: [['WHILE CROUCHED:', NOTE], ['TAKE 20% LESS DAMAGE', GOOD], ['RELOAD 20% FASTER', GOOD]],

    apply: (mods, n) => {
      mods.crouchGuard = Math.min(0.9, 0.2 * n);
      mods.crouchReload = Math.min(0.9, 0.2 * n);
    },
}));

export const icon = [
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........1......1........',
  '......2221....2221......',
  '......222222222221......',
  '......122222222211......',
  '.......2222222221.......',
  '.......2200220021.......',
  '.......2200220021.......',
  '.......2222442221.......',
  '.......1224004211.......',
  '........12400411........',
  '.........244441.........',
  '........00022000........',
  '......400000000002......',
  '...444400000000003442...',
  '..44333000000000033332..',
  '.4433333300000033333332.',
  '443333333333333333333332',
  '433333333333333333333332',
  '222222222222222222222222',
];
