import { definePassiveItem } from '../shared.js';

export const id = 'berserker';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'BERSERKER',
    max: 2,
    theme: 0x8b0000,
    // Deliberately no numbers: the shape of the deal is the whole pick, and a
    // percentage that only pays at an HP the player is trying not to be at
    // told them less than the sentence does.
    effects: [
      ['LOW HEALTH =', NOTE],
      ['MORE DAMAGE DEALT', GOOD],
    ],
    apply: (mods, n) => { mods.berserk += 0.5 * n; },
}));

// THE BEARDED AXE, STILL DRESSED. Chipped edge, hung on its haft, with the
// last fight coming off it in drops - the card pays when the run is bleeding,
// and the blade looks it.
export const icon = [
  '........................',
  '........................',
  '........................',
  '........................',
  '..............42221.....',
  '............422222221...',
  '............2242222241..',
  '............2222023341..',
  '............211223321...',
  '.............1222231....',
  '..............2221......',
  '...............21...3...',
  '.............21...4.3...',
  '............21.....43...',
  '..........21.......3....',
  '.........21.......3.....',
  '........21.......1......',
  '......21................',
  '.....21.................',
  '....21..................',
  '...11...................',
  '........................',
  '........................',
  '........................',
];
