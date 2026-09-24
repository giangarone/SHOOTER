import { definePassiveItem } from '../shared.js';

// THE WHOLE HIT, NOT HALF OF IT. At 50% this was a pick that shortened a
// fight the player was already losing by a fraction they could not see: half
// of one melee swing, spread over a health bar that scales with the wave.
// At 100% it is legible - whatever just hit you takes exactly that much - and
// it becomes the answer to the crowd that surrounds you rather than a small
// discount on being surrounded.
//
// IT IS STILL NOT A WAY TO PLAY. The damage is paid out of the player's own
// health bar, so the optimal exploit - standing in a crowd and letting them
// kill themselves - is the same play that kills you first: it reflects what
// an attacker DEALT, and dealing is the part that ends runs. Nothing here
// heals, blocks or caps the incoming hit.
export const id = 'thorns';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'THORNS',
    max: 1,
    theme: THEME.thorns,
    effects: [['MELEE ATTACKERS TAKE', GOOD], ['THEIR DAMAGE BACK', NOTE]],
    apply: (mods, n) => { mods.thorns = 1 * n; },
}));

export const icon = [
  '........................',
  '........................',
  '........................',
  '........2......2........',
  '........42....42........',
  '........43422442........',
  '........43222232........',
  '.......2211111221.......',
  '...2444211....1224422...',
  '....23311......12322....',
  '.....421........222.....',
  '.....221........221.....',
  '.....221........221.....',
  '.....421........222.....',
  '....44321......22332....',
  '...2222221....2212222...',
  '.......1222222211.......',
  '........43222232........',
  '........42211232........',
  '........22....22........',
  '........2......2........',
  '........................',
  '........................',
  '........................',
];
