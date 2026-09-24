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

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'BICYCLE KICK',
    max: 1,
    theme: 0x81d4fa,
    effects: [['JUMP HEIGHT +50%', GOOD]],
    apply: (mods, n) => { mods.bicycleKick = n; },
}));

// THE KICK ITSELF. A body horizontal, one leg extended, mid-rotation - the
// arcade bicycle kick, drawn as the arc of a figure flipping with a foot out.
export const icon = [
  '........................',
  '........................',
  '...........44...........',
  '..........4334..........',
  '.........33..33.........',
  '...........44...........',
  '..........4334..........',
  '.........33..33.........',
  '...........44...........',
  '..........4334..........',
  '.........33..33.........',
  '.....3..................',
  '....3........44.........',
  '...3.......4331.........',
  '...3.....4333331........',
  '....3.33.3222221........',
  '.....333.3111111........',
  '....3.2.........3.......',
  '...111111111111111111...',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
];
