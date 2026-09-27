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

// THE STANCE ITSELF. Low line, heel down, burst already away - three bright
// answers out of a lower profile than the room was shooting at.
export const icon = [
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........221.............',
  '.......42221............',
  '.......20021............',
  '.......22221.......4....',
  '......222221......3343..',
  '.....222222122221.33333.',
  '........222222201..43...',
  '.....222221.............',
  '.....222221.............',
  '....2222221.............',
  '....22221...............',
  '....221....221..........',
  '....21.....21...........',
  '....21.....21...........',
  '...2211...2221..........',
  '..111111111111111111111.',
  '........................',
  '........................',
  '........................',
];
