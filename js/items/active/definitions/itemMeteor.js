import { defineActiveItem } from '../shared.js';

export const id = 'itemMeteor';

export default defineActiveItem(({ THREE, THEME, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'FALLING SKY',
    charge: 60,
    theme: THEME.ember,
    // TWELVE ROCKS OVER THREE SECONDS, PLACED AT RANDOM. The randomness is the
    // item: it is the one thing in the pool the player does not aim, so what
    // they are buying is three seconds of the room being a worse place to
    // stand for everybody who is not them.
    //
    // IT CANNOT HURT THE PLAYER, and that is not generosity. Every telegraph
    // in this game is a question answered by moving, and it can be answered
    // because the player knows who threw it. A dozen rocks THEY called down
    // from nowhere in particular would be a question with no answer.
    effects: [['SHOWER THE ARENA', GOOD], ['WITH 12 METEORS, 3s', NOTE]],
    use: (game) => {
      // THREE OF THE PLAYER'S OWN SHOTS PER ROCK, snapshotted at the press for
      // the same reason a turret's is: the shower was called down by the gun
      // in hand, and twelve rocks that quietly got stronger because a totem
      // was claimed while they were falling would be damage nobody aimed.
      const p = game.player;
      const dmg = p.getEffectiveDamage(p.weapon.damage) * 3;
      for (let i = 0; i < 12; i++) {
        // Biased toward wherever the enemies actually are, by picking a random
        // one and scattering around it. Uniform over the whole floor would put
        // most of the shower in the empty half of an arena this size.
        const near = game.enemies.length
          ? game.enemies[(Math.random() * game.enemies.length) | 0] : null;
        const cx = near && !near.dead ? near.pos.x : 0;
        const cz = near && !near.dead ? near.pos.z : 0;
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * 9;
        game.deploy(new Meteor(
          game,
          Math.max(-BOUND + 2, Math.min(BOUND - 2, cx + Math.cos(a) * r)),
          Math.max(-BOUND + 2, Math.min(BOUND - 2, cz + Math.sin(a) * r)),
          (i / 12) * 3 * (0.7 + Math.random() * 0.6),
          dmg
        ));
      }
      game.effects.shockwave(game.player.pos, THEME.ember, 8, 0.5);
      game.sfx.itemSky();
    },
}));
