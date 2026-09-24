import { definePassiveItem } from '../shared.js';

// ---- WHAT HAPPENS AROUND YOU --------------------------------------------

// LITTLE BROTHER, INVOLUNTARILY. It is the item's own turret, thrown by
// being hit rather than by a button, and the cap is what stops a bad wave
// from filling the arena: five at once, ten seconds each.
export const id = 'panicTurret';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'PANIC TURRET',
    max: 1,
    theme: THEME.panicTurret,
    effects: [['TAKING A HIT DROPS', GOOD], ['A TURRET, 10s, MAX 5', NOTE]],
    apply: (mods, n) => { mods.panicTurret = n; mods.panicLife = 10; mods.panicMax = 5; },
}));

export const icon = [
  '........................',
  '........................',
  '...........21...........',
  '...........21...........',
  '..........2221..........',
  '..........2221..........',
  '.........222221.........',
  '........22200221........',
  '........22033321........',
  '.......2220333221.......',
  '.......2200333021.......',
  '......222003330221......',
  '......220033330021......',
  '.....22203333330221.....',
  '.....22003300330021.....',
  '....2220333003330221....',
  '....2200033003300021....',
  '...222000333333000221...',
  '...220000033330000021...',
  '..22222222222222222221..',
  '.1111111111111111111111.',
  '........................',
  '........................',
  '........................',
];
