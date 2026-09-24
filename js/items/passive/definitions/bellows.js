import { definePassiveItem } from '../shared.js';

// ARMOUR AT THE TOP OF THE STAMINA BAR, which is the one meter in this game
// nothing had ever read as a RESOURCE - it was a permission to sprint and a
// lockout when it ran out, and that was all of it. RUNNING ON FUMES pays for
// the bottom of it; this pays for the top, and the two are exact opposites.
//
// FULL MEANS FULL, on PACE CAR's terms: the moment a sprint, a slide or a
// dash takes anything off the top the armour is gone until the bar is back.
// What makes that affordable rather than punishing is that stamina refills on
// its own - the guard is always a few seconds away from coming back, however
// badly the fight is going, which is not true of any other conditional guard
// in the pool.
export const id = 'bellows';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'BELLOWS',
    max: 1,
    theme: 0x84b6c4,
    effects: [['TAKE 15% LESS DAMAGE', GOOD], ['AT FULL STAMINA', NOTE]],
    apply: (mods, n) => { mods.bellowsGuard = 0.15 * n; },
}));

// THE FULL BAR, ARMED. A brimming stamina gauge up top, the concertina
// bellows breathing puffs below it, and the little shield that only holds
// while the bar stays exactly where it is.
export const icon = [
  '........................',
  '........................',
  '........................',
  '......433333333331......',
  '......443333333331......',
  '......211111111111......',
  '........................',
  '........................',
  '........................',
  '..4422222222222.........',
  '...432323232323332.3....',
  '...223232323232332333...',
  '...432323232323331.3....',
  '...223232323232331......',
  '..2222222222221.........',
  '.................44.....',
  '................4331....',
  '................4331....',
  '.................31.....',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
];
