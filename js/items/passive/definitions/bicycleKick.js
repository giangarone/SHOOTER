import { definePassiveItem } from '../shared.js';

// THE JUMP, RAISED. A pure movement pick: the arc is taller and that is the
// whole offer. (The landing once staggered nearby enemies; that half was cut,
// and the shove it paid went with it - STILT LEGS owns the weaponised landing
// now.)
//
// THE BONUS FOLDS INTO THE IMPULSE, so it composes with DOUBLE JUMP (the
// air jump is raised too - the card says jump height, and an air jump is a
// jump) and with every consumer of the figure.
export const id = 'bicycleKick';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'BICYCLE KICK',
    max: 1,
    theme: THEME.bicycleKick,
    effects: [['JUMP HEIGHT +50%', GOOD]],
    apply: (mods, n) => { mods.bicycleKick = n; },
}));

// THE KICK ITSELF. A body horizontal, one leg extended, mid-rotation - the
// arcade bicycle kick, drawn as the arc of a figure flipping with a foot out.
export const icon = [
  '........................',
  '..........3333..........',
  '.........33333..........',
  '........33333...........',
  '........3333..........2.',
  '.......3333..........22.',
  '......3333.........222..',
  '.....3333.........222...',
  '....33333........222....',
  '...3333333.....2222.....',
  '..3333333333322222......',
  '...333333333322222......',
  '....2333333222222.......',
  '.....22222222222........',
  '....22223333322.........',
  '...222...3333322........',
  '..22.......33333........',
  '............3333........',
  '...........3333.........',
  '..........3333..........',
  '.........3333...........',
  '........3333............',
  '.........33.............',
  '........................',
];
