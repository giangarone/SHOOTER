import { definePassiveItem } from '../shared.js';

export const id = 'crouchfire';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'CROUCHFIRE',
    max: 2,
    theme: 0xa1887f,
    // THE CROUCH ALREADY COSTS HALF THE PLAYER'S SPEED and until now bought
    // nothing but a lower head. This is the pick that makes it a stance: the
    // rate is read live off `crouching`, so it arrives the frame the button
    // lands and leaves the frame it is let go, and the player finds that out
    // by holding a trigger through a crouch rather than by reading it.
    //
    // Sliding does NOT count. A slide is a movement, not a stance, and one
    // that fired 20% faster would be the best way to cross a room shooting.
    effects: (n) => [['FIRE RATE ' + step(n, pctUp(20)), GOOD], ['WHILE CROUCHING', NOTE]],
    apply: (mods, n) => { mods.crouchRate += 0.2 * n; },
}));

export const icon = [
  '........................',
  '........................',
  '.....221................',
  '....22221...............',
  '...2222221..............',
  '...2222221..........4442',
  '...1222211..........2222',
  '....12211...............',
  '.....221............42..',
  '....2222221.........22..',
  '....2222221.............',
  '....2222222111111111....',
  '....2222222222222221....',
  '....2222221122211111....',
  '....2222221.2221........',
  '....2222221.2221........',
  '....2222221.2221........',
  '....222222222221........',
  '....222222222221........',
  '....222222222221........',
  '....222222222221........',
  '.11111111111111111111111',
  '.11111111111111111111111',
  '........................',
];
