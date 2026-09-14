import { defineActiveItem } from '../shared.js';

export const id = 'itemHoming';

export default defineActiveItem(({ THREE, THEME, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'BIRD DOG',
    charge: 40,
    theme: THEME.precision,
    // SEEKER, ON A CLOCK. It reads the same _homeShot path the passive item
    // does - the same cone, the same line-of-sight check, the same bent tracer
    // - so a player who has carried Seeker already knows exactly what this
    // does, and a player who has not gets shown the mechanic for ten seconds.
    //
    // It does not stack with the passive item and it does not need to: the
    // shot path takes the wider of the two cones, so owning Seeker makes this
    // item a dead press rather than a double one, which is the honest
    // behaviour.
    effects: [['SHOTS HOME IN ON', GOOD], ['TARGETS FOR 10s', NOTE]],
    duration: 10,
    use: (game) => {
      game.player.itemHoming = 1;
      game.effects.shockwave(game.player.pos, THEME.precision, 6, 0.5);
      game.sfx.itemSurge();
    },
    end: (game) => { game.player.itemHoming = 0; },
}));
