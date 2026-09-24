import { definePassiveItem } from '../shared.js';

// EVERY WAVE OPENS AT FIFTY, up OR down. It is a floor for a run that is
// losing and a ceiling for one that is winning, and the healing bonus is what
// decides which: fifty and a 1.5x heal is a hand back into the fight, and
// fifty out of two hundred is a wave you have to earn back.
export const id = 'emergencyRations';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'EMERGENCY RATIONS',
    max: 1,
    theme: 0x74d17a,
    effects: [['EACH WAVE STARTS YOU', NOTE], ['AT EXACTLY 50 HP', BAD], ['HEALING +50%', GOOD]],
    apply: (mods, n) => { mods.rations = 50; mods.healMult *= 1 + 0.5 * n; },
}));

export const icon = [
  '........................',
  '..........2221..........',
  '.....22222000022221.....',
  '....2220000000000221....',
  '....2200000000000021....',
  '....22220000000022221...',
  '....22222222222222221...',
  '....22222222222222221...',
  '....22222222222222221...',
  '....22222222222222221...',
  '....22222222222222221...',
  '....22222222222222221...',
  '....43333333333333332...',
  '....43333333333333332...',
  '....43333333333333332...',
  '....43333333333333332...',
  '....43333333333333332...',
  '....43333333333333332...',
  '....43333333333333332...',
  '....43333333333333332...',
  '....23333333333333222...',
  '.....22233333332222.....',
  '........22222222........',
  '........................',
];
