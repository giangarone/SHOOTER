import { definePassiveItem } from '../shared.js';

// VENOM ROUNDS, IN THE DRUM. The turret was the one thing in the game that
// put damage in the room and carried nothing with it - every status the
// player owns rides their own bullets and stops at the muzzle. Four seconds
// of poison twice a beat is a body that stays poisoned for as long as the
// sentry can see it, which is worth more than the shot itself.
//
// THE PLAYER'S OWN POISON, at poison's fixed base, and it stacks under
// SECONDARY INFECTION exactly as the gun's does. A turret with a poison of its
// own would have been a fourth number nobody could find.
export const id = 'venomgrid';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'VENOMGRID',
    max: 1,
    theme: 0x4caf50,
    effects: [['YOUR TURRETS POISON', GOOD], ['WHAT THEY HIT', NOTE]],

    apply: (mods, n) => { mods.turretPoison = 1 * n; mods.turretPoisonTime = 4; },
}));

export const icon = [
  '........................',
  '........................',
  '....................2...',
  '....................2...',
  '....................2...',
  '...................442..',
  '..................2432..',
  '...................232..',
  '....................42..',
  '...222222222221.....42..',
  '...220002222221....4432.',
  '...200000222222222443332',
  '...200000222222222333332',
  '...200002222221111233322',
  '...222022222221....2222.',
  '...112222221111.........',
  '.....2222221............',
  '.....2222221............',
  '....222221121...........',
  '....211221.21...........',
  '...221.221.121..........',
  '...211.221..21..........',
  '...21..121..121.........',
  '...11...11...11.........',
];
