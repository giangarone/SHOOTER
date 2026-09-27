import { definePassiveItem } from '../shared.js';

export const id = 'speedLoader';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'SPEED LOADER',
    max: 3,
    theme: 0xffb300,
    effects: (n) => [['RELOAD ' + step(n, pctDown(0.7)), GOOD]],
    apply: (mods, n) => { mods.reloadMult *= Math.pow(0.7, n); },
}));

// THE FULL MOON CLIP. Six chambers punched round the star-release, five
// lit with the rounds still in them - the reload measured in a wrist-flick.
export const icon = [
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '....43.43.43.43.43......',
  '....21.21.21.21.21......',
  '....21.21.21.21.21......',
  '....21.21.21.21.21......',
  '....21.21.21.21.21......',
  '....21.21.21.21.21......',
  '....21.21.21.21.21......',
  '....21.21.21.21.21......',
  '....212212212212211.....',
  '....2222220001222221....',
  '....2222220401222221....',
  '.....11111111111111.....',
  '........................',
  '........................',
  '........................',
  '........................',
];
