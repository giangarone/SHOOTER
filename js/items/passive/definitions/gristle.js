import { definePassiveItem } from '../shared.js';

// SCAR TISSUE OFF THE FLOOR INSTEAD OF OFF THE CLOCK. That pick banks max
// health at a wave clear, which is a thing that happens TO a run; this banks
// it off a crate, which is a thing the player walked to - so a run carrying
// it collects health it does not need, and the bar itself is what the wave
// paid out.
//
// ONE POINT AND NOT FIVE. It has no ceiling and no wave gate, so the number
// has to be small enough that thirty crates is thirty health and not a
// second run's worth of bar.
export const id = 'gristle';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'GRISTLE',
    max: 1,
    theme: THEME.gristle,
    effects: [['HEALTH CRATES: 30%', NOTE], ['CHANCE OF +1 MAX HP', GOOD], ['PERMANENTLY', NOTE]],
    apply: (mods, n) => { mods.gristleChance = 0.3 * n; mods.gristleHp = 1; },
}));

export const icon = [
  '........................',
  '......2221....2221......',
  '.....222221..222221.....',
  '.....22222222222221.....',
  '.....22222222222221.....',
  '.....12222222222211.....',
  '......121122222211......',
  '.......11.2222111.......',
  '..........22221.........',
  '..........23331.........',
  '..........23331.........',
  '.........4433332........',
  '.........4333332........',
  '.........2333322........',
  '..........23331.........',
  '..........23331.........',
  '.......21.2222221.......',
  '......222222222221......',
  '.....22222222222221.....',
  '.....22222222222221.....',
  '.....22222111222221.....',
  '.....122211..122211.....',
  '......1111....1111......',
  '........................',
];
