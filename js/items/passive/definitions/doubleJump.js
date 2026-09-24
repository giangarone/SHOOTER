import { definePassiveItem } from '../shared.js';

export const id = 'doubleJump';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'DOUBLE JUMP',
    max: 1,
    theme: THEME.leap,
    // The air jump is deliberately STRONGER than the ground one (11 vs 9
    // against gravity 22): a second hop that only matched the first would clear
    // nothing the first had not already cleared. At 11 off the apex the player
    // tops out near 4.6m, which is over every enemy in the pool and onto the
    // high platforms.
    effects: [['DOUBLE JUMP IN MIDAIR', GOOD], ['REACHES ~4.5m HIGH', NOTE]],
    apply: (mods, n) => { mods.extraJumps = n; },
}));

export const icon = [
  '........................',
  '........................',
  '........................',
  '...........42...........',
  '..........4432..........',
  '..........4332..........',
  '.........443332.........',
  '.........233322.........',
  '..........4332..........',
  '..........4332..........',
  '..........2322..........',
  '...........22...........',
  '........................',
  '........................',
  '........................',
  '...........21...........',
  '..........2221..........',
  '..........2221..........',
  '.........122211.........',
  '..........1211..........',
  '...........21...........',
  '...222222222222222221...',
  '...222222222222222221...',
  '...111111111111111111...',
];
