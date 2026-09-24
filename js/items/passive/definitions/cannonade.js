import { definePassiveItem } from '../shared.js';

// ---- DAMAGE -------------------------------------------------------------

// TEN TIMES, ONCE A MAGAZINE. It is the reload rhythm turned into a weapon:
// Breach Round and Hellfire both pay the player for reloading, and this pays
// them for reloading EARLY, which is the one thing those two do not ask for.
export const id = 'cannonade';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'CANNONADE',
    max: 1,
    theme: THEME.cannonade,
    effects: [['FIRST SHOT OF EACH', NOTE], ['MAGAZINE: 10x DAMAGE', GOOD]],
    apply: (mods, n) => { mods.firstShot = 10 * n; },
}));

export const icon = [
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '.21.........242....422..',
  '.21..........42....42...',
  '.2221........232..422...',
  '.22222221.....434442....',
  '.22222221.....433332....',
  '.22222221....44344332...',
  '.22222222444443444433442',
  '.22222221222233344332222',
  '.22222221....23333322...',
  '.22222111.....433332....',
  '.211111.......422232....',
  '.21..........422..232...',
  '.21.........222....222..',
  '.11..........2......2...',
  '........................',
  '........................',
  '........................',
  '........................',
];
