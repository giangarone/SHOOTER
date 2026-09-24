import { definePassiveItem } from '../shared.js';

// HEALTH BOUGHT WITH SIGHT. Bulwark sells max HP for speed; this sells it
// for the range at which the room can be read at all, which is a much
// stranger thing to own - the haze sits far thicker than a boss wave's, so
// enemy colour arrives late and a shot across the arena is taken on a shape.
// Driven through rig.js, which owns the fog and breathes it with the music,
// so this is one multiplier on the target rather than a second writer.
//
// TWENTY-FIVE HEALTH, NOT FIFTY-FIVE. At fifty-five this was the biggest
// single block of health in the pool and the haze was something a player
// simply learned to play through inside one wave - a drawback you adapt to
// is a drawback you stop paying, and the health never stopped paying. A
// quarter of a starting bar is still worth taking and no longer worth taking
// blind.
//
// 3.2x, NOT 1.9x. At 1.9 the far wall was slightly greyer and the health
// was free: the fog is exponential-squared (FogExp2), so at the base
// 0.013 the haze does not start EATING anything until well past the far side
// of a 43m room, and doubling a number that small doubles nothing the player
// can see. The curve has to be moved to where the fight actually happens.
// At 0.042 an enemy at twenty metres - across the arena, the range a shot is
// taken at - is half washed out, and one at thirty is most of the way gone,
// so colour arrives late and the far half of the room is a set of shapes.
// That is the drawback the card has always claimed and never charged.
export const id = 'blackout';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'BLACKOUT',
    max: 1,
    theme: THEME.murk,
    effects: [['+25 MAX HEALTH', GOOD], ['HEAVY FOG', BAD], ['HARD TO SEE FAR', BAD]],
    apply: (mods, n) => {
      mods.maxHpBonus += 25 * n;
      mods.fogMult *= 1 + 2.2 * n;
    },
}));

export const icon = [
  '........................',
  '........................',
  '........................',
  '222222222222222222222221',
  '111111112222222111111111',
  '........43333332........',
  '.....44443333333442.....',
  '....4433333333333332....',
  '...443333330033333332...',
  '222222222222222222222221',
  '222222222222222222222221',
  '122222222222222222222211',
  '.2333333000000003333322.',
  '..43333330000003333332..',
  '..23333330000003333322..',
  '...433333330033333332...',
  '222222222222222222222221',
  '111111112222222111111111',
  '........22222222........',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
];
