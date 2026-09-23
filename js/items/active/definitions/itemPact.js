import { defineActiveItem } from '../shared.js';

export const id = 'itemPact';

export default defineActiveItem(({ THREE, THEME, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'BLOOD PRICE',
    charge: 30,
    theme: THEME.pact,
    // PAID UP FRONT, IN THE ONE CURRENCY THE PLAYER CANNOT FARM. It is the
    // same trade RED MIST offers with the terms reversed: that one is cheap
    // now and dangerous for five seconds, this one is expensive now and free
    // for ten. A player at full health should find this the easier press, and
    // a player at thirty should find it a real question.
    effects: [['3x DAMAGE FOR 10s', GOOD], ['COSTS 25 HP', NOTE]],
    duration: 10,
    use: (game) => {
      const p = game.player;
      pay(p, 25);
      p.itemDamageMult = 3;
      game.ui.damage();
      game.effects.shockwave(p.pos, THEME.pact, 7, 0.6);
      game.effects.burst(p.eyeInto(_v), 0xb71c1c, 30, 6, 3, 0.8);
      game.sfx.itemPact();
    },
    end: (game) => { game.player.itemDamageMult = 1; },
}));
