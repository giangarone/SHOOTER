import { defineActiveItem } from '../shared.js';

export const id = 'itemFreeze';

export default defineActiveItem(({ THREE, THEME, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'CRYO PULSE',
    charge: 40,
    theme: THEME.ice,
    // The whole floor at once, through the same per-enemy status a cryo round
    // applies - which means bosses downgrade it to a slow through the
    // resistance block they already carry (see freezeSlow on a boss's stat block in
    // js/enemies/). That is
    // the correct answer and not a special case: an item that could stop a boss
    // dead for five seconds every twenty would be the only boss strategy there is.
    //
    // The cheapest item in the pool because it does no damage. It buys
    // distance, and distance is what the player then has to use - and the
    // player finds that out by carrying it, not by reading it.
    effects: [['FREEZE ALL ENEMIES', GOOD], ['FOR 5s', NOTE]],
    use: (game) => {
      for (const e of game.enemies) e.applyStatus('freeze', 5);
      game.effects.shockwave(game.player.pos, THEME.ice, 26, 0.9);
    },
}));
