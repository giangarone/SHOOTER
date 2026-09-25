import { definePassiveItem } from '../shared.js';

// ---- WHAT HAPPENS AROUND YOU --------------------------------------------

// LITTLE BROTHER, INVOLUNTARILY. It is the item's own turret, thrown by
// being hit rather than by a button, and the cap is what stops a bad wave
// from filling the arena: five at once, ten seconds each.
export const id = 'panicTurret';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'PANIC TURRET',
    max: 1,
    theme: 0xffa733,
    effects: [['TAKING A HIT DROPS', GOOD], ['A TURRET, 10s, MAX 5', NOTE]],
    apply: (mods, n) => { mods.panicTurret = n; mods.panicLife = 10; mods.panicMax = 5; },
}));

// ALARM UP. The turret at rest on its base, the bell that rings it awake,
// and the panic it fires in every direction.
export const icon = [
  '........................',
  '........................',
  '................4.......',
  '...................4....',
  '....4.............3.4...',
  '.................1......',
  '....1..44.......2.......',
  '.......23......2...4....',
  '.......1......2.........',
  '.....4....4424......1...',
  '.........423322.........',
  '....1....221211.........',
  '...........42...........',
  '...........22...........',
  '...........22...........',
  '...........22...........',
  '........42222221........',
  '........42222221........',
  '......422222222222......',
  '......111111111111......',
  '........................',
  '........................',
  '........................',
  '........................',
];
