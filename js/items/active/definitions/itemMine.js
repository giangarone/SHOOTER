import { defineActiveItem } from '../shared.js';

export const id = 'itemMine';

export default defineActiveItem(({ THREE, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'WELCOME MAT',
    charge: 30,
    theme: 0xff7043,
    // THE PLAYER CANNOT SET IT OFF AND CAN STILL BE KILLED BY IT. Both halves
    // were asked for and both are right: the trigger belongs to the enemy, and
    // the blast belongs to the room. A mine you could safely stand next to
    // would be five free shots' worth on a six-metre circle every eight
    // seconds; a mine that went off under your own feet could not be thrown
    // anywhere worth throwing it.
    //
    // FIVE OF THE PLAYER'S OWN SHOTS. It is the biggest single number the item
    // pool hands out, and it should be: it has to be aimed, it has to be
    // waited for, and the thing it kills has to walk onto it.
    //
    // Thirty seconds, so the player can lay a line of them across the way in
    // during a lull - which is the item, and it is a completely different item
    // from pressing it once when something is already on top of you.
    effects: [['THROW A MINE: BIG BLAST', GOOD], ['ON ENEMIES ONLY', NOTE]],
    use: (game) => {
      const p = game.player;
      p.muzzleInto(_v);
      facing(game);
      game.deploy(new Lob(game, _v, _dir, 'mine', p.getEffectiveDamage(p.weapon.damage) * 5));
      game.sfx.itemDeploy();
    },
}));

export const icon = [
  '........................',
  '........................',
  '........................',
  '........................',
  '................43......',
  '..............32........',
  '............3...........',
  '.....22222222222222.....',
  '....2442222222222221....',
  '....2222222442222221....',
  '....2222224244222221....',
  '....2232200222223221....',
  '....2222211111222221....',
  '....2223222222223221....',
  '....2222222222222221....',
  '....2222222222222211....',
  '.....11111111111111.....',
  '.......1111111111.......',
  '..........3223..........',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
];
