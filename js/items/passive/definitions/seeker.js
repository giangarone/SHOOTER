import { definePassiveItem } from '../shared.js';

export const id = 'seeker';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'SEEKER',
    max: 1,
    theme: 0xff5fd2,
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

export const icon = [
  '................1.......',
  '.............2111121....',
  '............111.1.111...',
  '...........11...1...11..',
  '...........1.........1..',
  '..........21.........21.',
  '......2222221..442..2221',
  '......1111211..222..1211',
  '..........11.........11.',
  '...........1.........1..',
  '...........21.2.1...11..',
  '...........4341.1.211...',
  '........444422111111....',
  '......4442222...1.......',
  '.....44222..2...1.......',
  '...44222........1.......',
  '..4422..........1.......',
  '..422...................',
  '..42....................',
  '.442....................',
  '.422....................',
  '442.....................',
  '222.....................',
  '.2......................',
];
