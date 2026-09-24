import { definePassiveItem } from '../shared.js';

// THE GUN NEVER STOPS, IT ONLY GETS EXPENSIVE. Ten dollars a round is real
// money on wave three and pocket change on wave thirty, which is the correct
// shape: it is an emergency early and a way of playing late.
export const id = 'cashCannon';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'CASH CANNON',
    max: 1,
    theme: THEME.cashCannon,
    effects: [['OUT OF AMMO?', NOTE], ['KEEP SHOOTING: $10/SHOT', GOOD]],
    apply: (mods, n) => { mods.cashCannon = 10 * n; },
}));

export const icon = [
  '........................',
  '........................',
  '........................',
  '........................',
  '..........42............',
  '.........4432...........',
  '........440032..........',
  '........400002..........',
  '.22221..430032..4442....',
  '.222111.2232224443332...',
  '22221.21..22..4300032...',
  '22221.21......43000032..',
  '22221.21......43000022..',
  '12221.11......4300032...',
  '.222211.......2233322...',
  '.22211..........2222....',
  '.1111.....44442.........',
  '..........43002.........',
  '..........400022........',
  '..........40002.........',
  '..........22222.........',
  '............2...........',
  '........................',
  '........................',
];
