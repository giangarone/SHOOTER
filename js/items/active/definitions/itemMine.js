import { defineActiveItem } from '../shared.js';

export const id = 'itemMine';

export default defineActiveItem(({ THREE, THEME, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'WELCOME MAT',
    charge: 30,
    theme: THEME.shrapnel,
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
  '........................',
  '........................',
  '.....44444444444442.....',
  '.....43222232222332.....',
  '.....431...22...232.....',
  '....2221....1....222....',
  '...42.21....1....2232...',
  '...22.21..2221...2122...',
  '..42..2222222222221.42..',
  '..22.22222222222221.22..',
  '..2.2222222222222221.2..',
  '.42.1222222222222211.42.',
  '.42..11222222222111..42.',
  '.22....1112221111....22.',
  '..2.......1111.......2..',
  '..42................42..',
  '..22................22..',
  '...42..............42...',
  '...22..............22...',
  '....22............22....',
];
