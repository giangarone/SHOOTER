import { definePassiveItem } from '../shared.js';

export const id = 'ghostPlate';

export default definePassiveItem(({ GOOD, BAD, NOTE }) => ({
    name: "GHOST PLATE",
    max: 1,
    theme: 0xb388ff,
    effects: [['10-POINT SHIELD', GOOD], ['REFORMS AFTER 8s', GOOD]],
    apply: (mods, n) => { mods.ghostPlate = 10 * n; mods.ghostPlateDelay = 8; },
    onTake: (player) => { player.ghostShield = player.mods.ghostPlate; player.ghostPlateBrokenAt = -1; },
}));

// THE PLATE THAT COMES BACK. A glowing heater shield on a circling reform
// arrow, its ghost tail still dripping off the tip - ten points, eight
// seconds, again.
export const icon = [
  '........................',
  '........................',
  '.....4..................',
  '..........4331..........',
  '......3.43333331.3......',
  '.....3..42222221..3.....',
  '.....3..44333321..3.....',
  '....3...22333321...3....',
  '....3...22433321...3....',
  '....3...22333321...3....',
  '....3...22332221...3....',
  '....3...22222221...3....',
  '.........222221.........',
  '..........2221..........',
  '...........21...........',
  '..........2..2....4.....',
  '.........2....2.........',
  '..........1..1..........',
  '...........1............',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
];

