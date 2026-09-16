import { definePassiveItem } from '../shared.js';

// THE CRATE AT FULL HEALTH, WORTH SOMETHING. Health plates are withheld at a
// full bar precisely because they would be a drop that cannot be spent (see
// rollDrop); PLASMA BAG answered that with shield and this answers it with
// the frame itself. Five max HP is the smaller number of the two on purpose -
// a crate is walked over several times a wave and the bar it grows compounds
// over a run - and it still heals normally under the cap.
//
// THE BANK IS ITS OWN, for GRISTLE's reason: that pick rides `crateHp` and
// one shared ceiling would let either eat the other's.
export const id = 'platedDessert';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'PLATED DESSERT',
    max: 1,
    theme: THEME.platedDessert,
    effects: [['FULL-HP CRATES GIVE', GOOD], ['+5 MAX HP INSTEAD', NOTE]],
    apply: (mods, n) => { mods.platedDessert = 5 * n; },
}));

// A SLICE OF CAKE UNDER A CLOCHE. The plated dessert: a dome over a slice,
// the one shape that says "served, and worth protecting".
export const icon = [
  '........................',
  '........................',
  '........2222222.........',
  '......22333333322.......',
  '.....2333333333332......',
  '....233333333333332.....',
  '....233333333333332.....',
  '...23333333333333332....',
  '..233333333333333332....',
  '..233333333333333332....',
  '..233322222222223332....',
  '..233222222222222332....',
  '..233224444444223332....',
  '..233244444444233332....',
  '..233244444444233332....',
  '..233224444442233332....',
  '..233222222222223332....',
  '..233333333333333332....',
  '..233333333333333332....',
  '...23333333333333332....',
  '...22333333333333322....',
  '....222222222222222.....',
  '.....22112222112222.....',
  '.....22222222222222.....',
];
