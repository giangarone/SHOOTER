import { definePassiveItem } from '../shared.js';

// BULWARK WITHOUT THE LEGS, and a much bigger number - what it charges is
// every heal in the run, so the bar is twice as long and half as easy to
// fill. A build with no healing in it pays nothing at all, which is the one
// way this is a free pick and the reason it is worth checking the sheet.
export const id = 'boneMarrow';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'BONE MARROW',
    max: 1,
    theme: THEME.boneMarrow,
    effects: [['+100 MAX HEALTH', GOOD], ['HEALING -50%', BAD]],
    apply: (mods, n) => {
      mods.maxHpBonus += 100 * n;
      mods.healMult *= Math.pow(0.5, n);
    },
}));

export const icon = [
  '........................',
  '........................',
  '........................',
  '........................',
  '...2221..........2221...',
  '..222221........222221..',
  '.22222221......22222221.',
  '.22222221......22222221.',
  '.22222221......22222221.',
  '.12222221......22222211.',
  '..12222222222222233321..',
  '...222333333333333332...',
  '...222333333333333332...',
  '..22223333333333333331..',
  '.2222222111111122222221.',
  '.22222221......22222221.',
  '.22222221......22222221.',
  '.12222211......12222211.',
  '..122211........122211..',
  '...1111..........1111...',
  '........................',
  '........................',
  '........................',
  '........................',
];
