import { definePassiveItem } from '../shared.js';

// BULWARK WITHOUT THE LEGS, and a much bigger number - what it charges is
// every heal in the run, so the bar is twice as long and half as easy to
// fill. A build with no healing in it pays nothing at all, which is the one
// way this is a free pick and the reason it is worth checking the sheet.
export const id = 'boneMarrow';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'BONE MARROW',
    max: 1,
    theme: 0x8bc34a,
    effects: [['+100 MAX HEALTH', GOOD], ['HEALING -50%', BAD]],
    apply: (mods, n) => {
      mods.maxHpBonus += 100 * n;
      mods.healMult *= Math.pow(0.5, n);
    },
}));

// THE CUT FEMUR. Cortical shell round the outside, and inside the webbing
// that makes the bar - pocketed, lit from within, condyles below.
export const icon = [
  '........................',
  '........................',
  '........................',
  '..........42221.........',
  '.......4222222221.......',
  '.....42222222222221.....',
  '....4233333333333321....',
  '....4233333333333321....',
  '....4233323320333221....',
  '....4234333233233321....',
  '....2233333233323321....',
  '....2233034443303321....',
  '....2232334433233221....',
  '....2233333323331121....',
  '....2233323333301121....',
  '....2233333333111121....',
  '....223333331112211.....',
  '....223333211.2211111...',
  '.....211111..111112.....',
  '......1111....1111......',
  '........................',
  '........................',
  '........................',
  '........................',
];
