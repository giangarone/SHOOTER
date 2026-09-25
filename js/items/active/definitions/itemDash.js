import { defineActiveItem } from '../shared.js';

export const id = 'itemDash';

export default defineActiveItem(({ THREE, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'BLINK DRIVE',
    charge: 3,
    theme: 0x1de9b6,
    // THE DASH USED TO BE A PASSIVE ITEM. Double Dash held two charges on a
    // 2.5s timer and was fired by double-tapping W, which is a binding that
    // exists because the game had no spare finger - and an active item slot IS
    // a spare finger. So it moved here whole: the envelope, the distance and
    // the forward-only commitment are untouched (see DASH_TIME in player.js),
    // and what changed is that it is now competing with a heal and a panic
    // button for the same slot rather than sitting in the pool for free.
    //
    // Three points - three basic enemies - against Double Dash's two charges
    // on a 2.5s timer. A single charge that comes back fast reads as mobility;
    // two charges that come back slowly read as an escape saved for the worst
    // moment, and the four items above already cover the worst moment.
    effects: [['DASH WHERE YOU LOOK', GOOD]],
    use: (game) => {
      // THE DASH GOES WHERE THE VIEW GOES, up as well as along. It used to be
      // flattened onto the floor, which made the one item in the pool that is
      // pure movement the one item that ignored half of where the player was
      // pointing - a dash taken at a catwalk went along the ground under it.
      // Pitch is the raw view angle rather than the recoil-shifted aim: the
      // player is dashing where they are LOOKING, and a shot's kick must not
      // steer them.
      game.player.dash(game.time, 1, game.player.pitch);
    },
}));

export const icon = [
  '........................',
  '........................',
  '........................',
  '..4444441...............',
  '..1111111...............',
  '........................',
  '....11....11....33......',
  '.....11....11....33.....',
  '......11....11....33....',
  '.......11....11....34...',
  '..3.....11....13....43..',
  '..3....11....11....33...',
  '......11....11....33....',
  '.....11....11....33.....',
  '....11....11....33......',
  '........................',
  '........................',
  '........................',
  '..4444441...............',
  '..1111111...............',
  '........................',
  '........................',
  '........................',
  '........................',
];
