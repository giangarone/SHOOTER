import { definePassiveItem } from '../shared.js';

export const id = 'petrify';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'PETRIFY',
    max: 1,
    theme: 0x9aa5b1,
    effects: [['HITS: 12% CHANCE TO', GOOD], ['FREEZE FOR 1.5s', NOTE], ['FROZEN TAKE +50% DMG', GOOD]],
    apply: (mods, n) => {
      mods.petrifyChance = 0.12 * n;
      mods.petrifyTime = 1.5 * n;
    },
}));

// THE FROZEN VISAGE. A stone face caught mid-turn: dead gleaming eyes,
// a grimace full of ice teeth, cracks splitting the cheeks with frozen
// veins tracing through them, set on a plinth like a warning.
export const icon = [
  '........................',
  '........................',
  '........44444444........',
  '......422222222221......',
  '......422220222221......',
  '......233333333331......',
  '......211111111111......',
  '......204022040221......',
  '......222022220221......',
  '......232202223021......',
  '......220000000021......',
  '......223430330321......',
  '.......2022322021.......',
  '........22022321........',
  '.........202221.........',
  '.......2111111111.......',
  '......422222222221......',
  '......211111111111......',
  '.....11111111111111.....',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
];
