import { definePassiveItem } from '../shared.js';

// THE SHOT THAT STAYS IN THE ROOM. An echo is what a sound does off the
// walls, and this is that, wired to the gun: a round that would stop on the
// room - wall, floor, any surface the arena owns - comes off it instead and
// carries on at full damage, twice. SKIPSTONE's own bounce is the floor
// alone, once; this is the whole room, twice, which is why the two share one
// branch in _firePellet: the flight is one mechanic, and a run holding both
// simply has the better card's two.
//
// SHOP FURNITURE AND BODIES STILL STOP THE ROUND. A totem is a claim, a box
// is a purchase, and an enemy is the shot landing - the bounce is a second
// chance at a MISS, not a way to shoot through the thing that was hit, and
// every one of those branches breaks the walk before the bounce can run.
export const id = 'echo';

export default definePassiveItem(({ GOOD, BAD, NOTE }) => ({
    name: 'ECHO',
    max: 1,
    theme: 0x6fd8c8,
    effects: [
      ['SHOTS BOUNCE OFF WALLS', GOOD],
      ['AND FLOOR, TWICE', NOTE],
    ],
    apply: (mods, n) => { mods.echo = 2 * n; },
}));

// THE FLIGHT PATH. One shot down out of the top-left, two pale marks where
// it meets the floor, and the echoes climbing away from each touch - the
// trajectory the card describes, drawn as a line.
export const icon = [
  '........................',
  '........................',
  '........................',
  '..3.....................',
  '..3.....................',
  '...3....................',
  '...3....................',
  '....3...................',
  '....3........3..........',
  '.....3......3.3.........',
  '.....3......3.3.........',
  '.....3.....3...3......3.',
  '......3....3....3.....3.',
  '......3...3.....3....3..',
  '.......3..3......3...3..',
  '.......3.3........3.3...',
  '.........3........3.3...',
  '........4..........4....',
  '.1111111111111111111111.',
  '.2222222222222222222222.',
  '........................',
  '........................',
  '........................',
  '........................',
];
