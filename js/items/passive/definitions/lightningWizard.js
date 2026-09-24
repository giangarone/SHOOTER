import { definePassiveItem } from '../shared.js';

export const id = 'lightningWizard';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'LIGHTNING WIZARD',
    max: 1,
    theme: 0x9fd8ff,
    // Rare per shot and heavy when it lands, which is the opposite trade to
    // Arc Rounds: that one is a small certainty on every hit, this is a large
    // uncertainty. At 5% a magazine usually contains one, so it reads as
    // punctuation rather than as a damage number the player has to plan on.
    effects: [['5% OF HITS CALL', GOOD], ['LIGHTNING: 90 DMG', NOTE], ['50 SPLASH AROUND', NOTE]],
    apply: (mods, n) => {
      mods.lightningChance = 0.05 * n;
      mods.lightningDamage = 90 * n;
      mods.lightningSplash = 50 * n;
      mods.lightningRadius = 4;
    },
}));

export const icon = [
  '...........221..........',
  '.........2222221........',
  '........222222221.......',
  '....22222222222221......',
  '...22222222222222221....',
  '...222222222222222221...',
  '...222222222222222221...',
  '...2222222222222222221..',
  '...2222222222222222221..',
  '...2222222222222222221..',
  '...2222222222222222221..',
  '...1111111112111111111..',
  '............2...........',
  '...........42...........',
  '..........442...........',
  '..........433422........',
  '.........223322.........',
  '...........422..........',
  '...........22...........',
  '...........2............',
  '..........22............',
  '..........2.............',
  '........................',
  '........................',
];
