import { definePassiveItem } from '../shared.js';

// THE LAST ROUND, CASHED. A magazine emptied INTO something reloads itself,
// so a build that counts its shots never stands still - and one that sprays
// the last five into a wall pays the full 1.4 seconds like everybody else.
export const id = 'chainFeed';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'CHAIN FEED',
    max: 1,
    theme: 0xffa726,
    effects: [['KILL WITH THE LAST', NOTE], ['ROUND: INSTANT RELOAD', GOOD]],
    apply: (mods, n) => { mods.chainFeed = n; },
}));

export const icon = [
  '........................',
  '...........42...........',
  '.........224321.........',
  '.....44222233222242.....',
  '.....23222233222231.....',
  '....2233111221123321....',
  '....22122......22221....',
  '...2221..........2221...',
  '.242211..........122222.',
  '..4332............4332..',
  '..2222............4221..',
  '..2221............2221..',
  '..2221............2221..',
  '..2222............4221..',
  '..4332............4332..',
  '.222221..........222122.',
  '...1221..........2211...',
  '....22242......44221....',
  '....1233222442223311....',
  '.....23222233222231.....',
  '.....22112233211122.....',
  '.........113211.........',
  '...........22...........',
  '........................',
];
