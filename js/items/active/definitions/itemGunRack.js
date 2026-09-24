import { defineActiveItem } from '../shared.js';

export const id = 'itemGunRack';

const ITEM_THEME = 0xffab40;

// HOW FAR IN FRONT THE RACK STANDS, AND HOW WIDE THE WINGS FAN. Both in the
// player's own gait units: close enough that the arc is BETWEEN the player
// and the room, far enough that walking backwards does not step on a barrel.
const RACK_AHEAD = 2.6;
const RACK_FAN = 0.66;      // radians between the centre post and a wing
const RACK_LIFE = 8;

export default defineActiveItem(({ THREE, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, Snowman, SNOWMAN_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'GUN RACK',
    charge: 50,
    theme: ITEM_THEME,
    // LITTLE BROTHER THREE WAYS. One turret is fire from somewhere the player
    // is not; three in an arc is a firing LINE in front of the player, thrown
    // up at once where they are aiming - which is a different emergency from
    // the one's slot. The turrets are the ordinary kind and keep the ordinary
    // rules: they pick their own targets, they fire on the beat, and the
    // player feeds SHARED MAG into them if they own it, because all of that
    // is what "a turret" already means.
    //
    // EIGHT SECONDS, NOT FIFTEEN. Three guns for two thirds of one gun's
    // life is the shape the price difference buys: LITTLE BROTHER is a
    // position, this is a moment - the room's far side, suppressed, for long
    // enough to walk somewhere.
    //
    // LAID ON AN ARC FACING THE AIM because placement is the whole item: the
    // centre post lands straight down the crosshair and the wings a third of
    // a radian off, so the rack opens in the direction the player was
    // looking when they called it, and they are standing BEHIND the guns
    // when it matters.
    effects: [['DEPLOY 3 AUTO-TURRETS', GOOD], ['IN AN ARC, FOR 8s', NOTE]],
    use: (game) => {
      const p = game.player;
      facing(game);
      const dmg = p.getEffectiveDamage(p.weapon.damage);
      for (let i = -1; i <= 1; i++) {
        // Rotating the aim vector itself, so the arc is measured the way the
        // player is looking rather than off a heading that has to be kept in
        // step with it.
        const c = Math.cos(i * RACK_FAN);
        const s = Math.sin(i * RACK_FAN);
        const fx = _dir.x * c - _dir.z * s;
        const fz = _dir.x * s + _dir.z * c;
        const x = Math.max(-BOUND + 1, Math.min(BOUND - 1, p.pos.x + fx * RACK_AHEAD));
        const z = Math.max(-BOUND + 1, Math.min(BOUND - 1, p.pos.z + fz * RACK_AHEAD));
        const t = new Turret(game, x, z, dmg, p.pos.y);
        t.life = RACK_LIFE;
        // Facing where you aim AT BIRTH: the first target snap happens on the
        // turret's own update, and the player reads the arc in the meantime.
        t.yaw = Math.atan2(fx, fz);
        t.head.rotation.y = t.yaw + Math.PI;
        game.deploy(t);
      }
      game.effects.shockwave(p.pos, ITEM_THEME, 6, 0.6);
      game.effects.burst(p.eyeInto(_v), 0xffab40, 20, 5, 3, 0.5);
      game.sfx.itemDeploy();
    },
}));

export const icon = [
  // Three tripod turrets in a row - the middle one a step forward. The head
  // is the emissive part, on the turret's own rule: the eye is where the
  // danger is.
  '........................',
  '.........0333330........',
  '.........0333330........',
  '.........0033300........',
  '.033330..0223220..033330',
  '.033330..0222220..033330',
  '.0033300.0222220.0033300',
  '..02320..0222220..02320.',
  '..02220...02220...02220.',
  '..02220...02220...02220.',
  '..02220...02220...02220.',
  '.022220...02220...022220',
  '.0222200..02220..0022220',
  '.020.020..02220..020.020',
  '.20...20..02220..020..02',
  '020.2.0...02220..0.2.020',
  '.00...00..02220..00...00',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
];
