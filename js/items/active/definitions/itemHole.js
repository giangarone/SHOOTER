import { defineActiveItem } from '../shared.js';

export const id = 'itemHole';

export default defineActiveItem(({ THREE, THEME, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'EVENT HORIZON',
    charge: 60,
    theme: THEME.gravity,
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
