import { defineActiveItem } from '../shared.js';

export const id = 'itemHole';

export default defineActiveItem(({ THREE, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'EVENT HORIZON',
    charge: 60,
    theme: 0x536dfe,
    // THROWN, NOT PLACED. The orb flies flat and fast along the line of sight,
    // so where the hole opens is a shot the player took rather than a circle
    // they stood in - and it can be put on the far side of a crowd, which is
    // the placement that actually gathers them.
    //
    // IT NEVER PULLS THE PLAYER. Asked for explicitly and correct anyway: a
    // pull that cannot be fought is the one thing in this game that takes the
    // movement away, and taking the movement away from the player who spent a
    // slot on the item is not a drawback, it is a bug with a rationale.
    effects: [['THROW A BLACK HOLE', GOOD], ['PULLS ENEMIES IN, CRUSHES', GOOD]],
    use: (game) => {
      const p = game.player;
      p.muzzleInto(_v);
      // The CAMERA's direction, not the flattened yaw: this is the one thrown
      // thing in the pool the player aims with the crosshair, so a shot taken
      // at a flier has to go up.
      game.camera.getWorldDirection(_dir);
      // TWICE ONE OF THE PLAYER'S OWN SHOTS A BEAT, snapshotted at the throw
      // the way a turret's damage is: the hole was opened by the gun in hand.
      game.deploy(new HoleOrb(game, _v.x, _v.y, _v.z, _dir.x, _dir.y, _dir.z,
        p.getEffectiveDamage(p.weapon.damage) * 2));
      game.pad.rumble(0.5, 0.6, 220, 2);
      game.sfx.itemDeploy();
    },
}));

export const icon = [
  '........................',
  '.........444442.........',
  '......444422233442......',
  '.....443332..433332.....',
  '....4223222222222232....',
  '...422.2222222221.232...',
  '..442.222222222221.432..',
  '..43322220000002222432..',
  '..43222200000000222232..',
  '.4432220000000000223332.',
  '.4222220000000000232232.',
  '.42.2220000000000232.42.',
  '.42.2220000000000232.42.',
  '.4342220000000000233442.',
  '.2332320000000000233322.',
  '..43233200000000233232..',
  '..43223320000002322332..',
  '..232.233222222322.422..',
  '...232.4333333332.422...',
  '....2344232223323422....',
  '.....233332..433322.....',
  '......222334442222......',
  '.........222222.........',
  '........................',
];
