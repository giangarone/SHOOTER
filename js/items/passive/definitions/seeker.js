import { definePassiveItem } from '../shared.js';

export const id = 'seeker';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'SEEKER',
    max: 1,
    theme: THEME.precision,
    // Rescues MISSES and nothing else. A shot already on target is never
    // touched, so this can never drag a bullet off the weak point the player
    // deliberately lined up - it only takes the shots that were going to hit
    // a wall and gives them somewhere to go.
    effects: [['NEAR MISSES CURVE', GOOD], ['ONTO A TARGET', NOTE], ['DIRECT HITS UNCHANGED', NOTE]],
    apply: (mods, n) => {
      // HALVED from 12 degrees. At 12 the cone was wide enough that aiming
      // roughly at a crowd hit something every time, which is the whole gun
      // rather than a rescue for the shots that deserved one. Halving the
      // half-angle takes roughly three quarters of the solid angle with it, so
      // this is a real cut and not a trim - a miss now has to be close to a
      // hit before the curve will pick it up.
      mods.homingAngle = 0.105 * n;
      mods.homingRange = 30;
    },
}));
