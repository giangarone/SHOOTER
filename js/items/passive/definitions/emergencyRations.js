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
  '........................',
  '...........43...........',
  '...........22...........',
  '........24422242........',
  '.......2222222222.......',
  '......222233332222......',
  '......242333333221......',
  '......223333333321......',
  '......222330333221......',
  '......222233332211......',
  '......222222222222......',
  '......223333333322......',
  '......223333333322......',
  '......222222222222......',
  '......222222222211......',
  '......111111111111......',
  '........11111111........',
  '................34......',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
];
