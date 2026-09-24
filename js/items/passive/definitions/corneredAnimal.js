import { definePassiveItem } from '../shared.js';

export const id = 'corneredAnimal';

export default definePassiveItem(({ GOOD, BAD, NOTE }) => ({
    name: "CORNERED ANIMAL",
    max: 1,
    theme: 0x85624f,
    effects: [['NEAR MAP BORDER:', NOTE], ['+40% DAMAGE', GOOD]],
    apply: (mods, n) => { mods.corneredAnimal = 0.4 * n; },
}));

// BACKED INTO THE CORNER. Two walls, a snarling head with lit eyes and
// bared fangs between them, anger marks up top - forty percent for having
// nowhere left to go.
export const icon = [
  '........................',
  '........................',
  '..44....................',
  '..42....................',
  '..42....................',
  '..42.......3...3........',
  '..42.......3...3........',
  '..42.....4333333331.....',
  '..42.....2442244221.....',
  '..42.....2222222221.....',
  '..42.....2422424241.....',
  '..42.....2000000001.....',
  '..42.....2242244241.....',
  '..42.....2222222221.....',
  '..42.......222221.......',
  '...........222222.......',
  '...........222221.......',
  '............2112........',
  '........................',
  '........................',
  '..11111111111111111111..',
  '..11111111111111111111..',
  '........................',
  '........................',
];

