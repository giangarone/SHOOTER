import { definePassiveItem } from '../shared.js';

export const id = 'overload';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'OVERLOAD',
    max: 1,
    theme: THEME.overload,
    // A fraction of MAX HP rather than a flat number, so it stays worth firing
    // the magazine dry on wave 40 as much as on wave 4. It is the one thing in
    // the pool that scales with the enemy instead of with the build - and the
    // health it charges per use is why it needs no drawback beyond itself.
    effects: [['EMPTY MAGAZINE:', NOTE], ['ALL ENEMIES TAKE 20%', GOOD], ['OF THEIR MAX HP', NOTE]],
    apply: (mods, n) => { mods.overloadFrac = 0.2 * n; },
}));

export const icon = [
  '...........4422.........',
  '...........422..........',
  '..........442...........',
  '.........4422...........',
  '.........422............',
  '........442.............',
  '.......443342...........',
  '.......4223332..........',
  '......222.4322..........',
  '.....42...432...........',
  '.....232.4432...........',
  '......22.4332...........',
  '.......42233342.........',
  '......422.233332........',
  '.....242...43332........',
  '......432..43332........',
  '......422.4222332.......',
  '......42..42..2332......',
  '.....422..232..2332.....',
  '....422....42...2332....',
  '...422.....42....232....',
  '...22......232....22....',
  '............22..........',
  '........................',
];
