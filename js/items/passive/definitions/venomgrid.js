import { definePassiveItem } from '../shared.js';

// VENOM ROUNDS, IN THE DRUM. The turret was the one thing in the game that
// put damage in the room and carried nothing with it - every status the
// player owns rides their own bullets and stops at the muzzle. Four seconds
// of poison twice a beat is a body that stays poisoned for as long as the
// sentry can see it, which is worth more than the shot itself.
//
// THE PLAYER'S OWN POISON, through Player.dotHit, so it scales with the build
// and stacks under SECONDARY INFECTION exactly as the gun's does. A turret
// with a poison of its own would have been a fourth number nobody could find.
export const id = 'venomgrid';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'VENOMGRID',
    max: 1,
    theme: THEME.venomgrid,
    effects: [['YOUR TURRETS POISON', GOOD], ['WHAT THEY HIT', NOTE]],

    apply: (mods, n) => { mods.turretPoison = 1 * n; mods.turretPoisonTime = 4; },
}));
