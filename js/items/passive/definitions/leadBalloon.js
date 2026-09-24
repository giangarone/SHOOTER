import { definePassiveItem } from '../shared.js';

export const id = 'leadBalloon';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'LEAD BALLOON',
    max: 1,
    theme: 0x6d4c41,
    // TWENTY-FIVE PERCENT IS A LOT, and the jump is a lot to give up. The
    // arena has catwalks, the boxes are cover you get ON as often as behind,
    // and half the enemies in the pool are answered by not being where they
    // are looking. This is the cursed pick that takes away a VERB rather than
    // a number, which is the only kind of drawback a player cannot stat their
    // way out of later in the run.
    //
    // IT DOES NOT TOUCH THE DASH, THE SLIDE OR A LEDGE. Everything the player
    // has for getting out of a corner still works, and one of them - the slide
    // - is the thing they will end up using instead. Taking the jump is meant
    // to change how the room is crossed, not to nail the player to the floor.
    effects: [['+25% DAMAGE', GOOD], ['JUMPING IS DISABLED', BAD]],
    apply: (mods, n) => {
      mods.damage *= 1 + 0.25 * n;
      mods.noJump = 1;
    },
}));

export const icon = [
  '.......221..............',
  '.....2222221............',
  '....222222221...........',
  '...22222222221..........',
  '..222222222221..........',
  '..2222222222221.........',
  '..2222222222221.........',
  '..2222222222211.........',
  '..122222222221..........',
  '...12222222211..........',
  '....122222211...........',
  '.....1121111............',
  '.......11...............',
  '........1...............',
  '.........11.............',
  '...........21...........',
  '...........44444444444..',
  '...........44444444444..',
  '...........43333333332..',
  '...........40000000332..',
  '...........43333333332..',
  '...........43333333332..',
  '...........22222222222..',
  '........................',
];
