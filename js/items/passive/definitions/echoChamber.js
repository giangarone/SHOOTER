import { definePassiveItem } from '../shared.js';

// A FREE ROUND EVERY FOURTH TRIGGER PULL, at half strength and off no
// magazine. Counted per SHOT and not per pellet, the rule every other
// per-shot pick in the pool follows.
export const id = 'echoChamber';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'ECHO CHAMBER',
    max: 1,
    theme: 0xffcc80,
    effects: [['EVERY 4th SHOT FIRES', GOOD], ['A HALF-DMG ECHO', NOTE], ['THAT COSTS NO AMMO', GOOD]],
    apply: (mods, n) => {
      mods.echoEvery = 4;
      mods.echoDamage = 0.5 * n;
    },
}));

export const icon = [
  '........................',
  '........................',
  '........................',
  '........................',
  '..22222221..............',
  '..22222221..............',
  '..22222221..............',
  '..22222221..........442.',
  '..22222221..444442..222.',
  '..22222221..433332......',
  '..22222221..433332......',
  '..22222221..433332......',
  '..22222221..433332..442.',
  '..12222221..433332..222.',
  '...2222221..233332......',
  '...2222221...43332......',
  '...2222211...43322......',
  '...122211....2332...442.',
  '....1221......222...222.',
  '.....111.......2........',
  '......1.................',
  '........................',
  '........................',
  '........................',
];
