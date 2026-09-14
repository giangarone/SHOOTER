import { defineActiveItem } from '../shared.js';

export const id = 'itemSwarm';

export default defineActiveItem(({ THREE, THEME, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'APIARY',
    charge: 45,
    theme: THEME.salvage,
    // FIVE SMALL THINGS RATHER THAN ONE BIG ONE. A single strong ally is a
    // second turret; five weak ones are a CLOUD, and a cloud does the one
    // thing a turret cannot - it spreads itself over the crowd without being
    // told to, and it follows the crowd when the crowd moves.
    //
    // Forty-five seconds, not sixty-four. Sixty-four is longer than most waves
    // last, which means the item would frequently be uncastable in the fight
    // it was taken for.
    effects: [['RELEASE 5 HUNTING BEES', GOOD], ['24s OF CHAOS', NOTE]],
    use: (game) => {
      const p = game.player;
      for (let i = 0; i < 5; i++) {
        game.deploy(new Bee(game, p.pos.x, p.pos.z, (i / 5) * Math.PI * 2));
      }
      game.effects.shockwave(p.pos, THEME.salvage, 5, 0.5);
      game.effects.burst(p.eyeInto(_v), 0xc6ff00, 26, 5, 3, 0.6);
      game.sfx.itemSwarm();
    },
}));
