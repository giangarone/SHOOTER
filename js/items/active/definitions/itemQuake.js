import { defineActiveItem } from '../shared.js';

export const id = 'itemQuake';

export default defineActiveItem(({ THREE, THEME, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'TECTONIC',
    charge: 20,
    theme: THEME.impact,
    // THE FORCE IS THE POINT AND THE DAMAGE IS THE RECEIPT. Forty is not much;
    // nine metres of everything leaving at once is a great deal, and what the
    // player actually bought is the second and a half it takes them all to
    // walk back. It answers the one thing nothing else in the pool answers -
    // being surrounded - without killing anything, so the fight is still
    // there when it lands.
    // THE SHOVE IS A TRAVEL, NOT A PLACEMENT. It goes through _shove, which
    // goes through Enemy.knock - the melee swing's own knockback - so a crowd
    // is visibly thrown out over half a second instead of being found already
    // scattered on the next frame. That half second IS the item: what the
    // player bought is the walk back, and they have to be able to watch it.
    effects: [['HURLS NEARBY ENEMIES', GOOD], ['FLYING, DEALING DAMAGE', NOTE]],
    use: (game) => {
      const p = game.player;
      const dmg = p.getEffectiveDamage(p.weapon.damage);
      for (const e of game.enemies) {
        if (e.dead) continue;
        const d = e.pos.distanceTo(p.pos);
        if (d > 9) continue;
        _v.set(e.pos.x - p.pos.x, 0, e.pos.z - p.pos.z);
        if (_v.lengthSq() < 1e-6) _v.copy(facing(game));
        // Falls off with distance, so the thing standing on top of you is
        // thrown the furthest. A flat shove would move the far edge of the
        // circle as hard as the enemy in your face, which is the opposite of
        // what an explosion looks like.
        game._shove(e, _v, 18 * (1 - d / 9) + 4);
        game.hurtEnemy(e, dmg);
      }
      game.effects.shockwave(p.pos, THEME.impact, 9, 0.6);
      game.effects.burst(p.pos, 0x00e5c0, 30, 9, 3, 0.6);
      game.effects.addShake(0.45);
      game.pad.rumble(0.9, 0.7, 260, 2);
      game.sfx.itemBlast();
    },
}));
