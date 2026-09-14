import { defineActiveItem } from '../shared.js';

// ---- windows on the player ---------------------------------------------
export const id = 'itemRate';

export default defineActiveItem(({ THREE, THEME, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'RED LINE',
    charge: 30,
    theme: THEME.rate,
    // Rides fireRateMult and fireRateBoostEnd - the fire-rate PICKUP's own two
    // fields - so it expires through machinery that already exists and shows
    // in the buff strip without being taught to, exactly the way OVERDRIVE
    // rides the rage pickup's. Math.max for the same reason: a pickup landing
    // on top of this must not downgrade it.
    //
    // Six seconds at eighteen, against OVERDRIVE's five at twenty. Rate is
    // worth slightly less than damage in a game where the magazine is finite -
    // twice the rate is also twice the reloads.
    effects: [['DOUBLE FIRE RATE', GOOD], ['FOR 6s', NOTE]],
    use: (game) => {
      const p = game.player;
      p.fireRateMult = Math.max(p.fireRateMult, 2);
      const end = game.time + 6;
      if (end > p.fireRateBoostEnd) {
        p.fireRateBoostEnd = end;
        p.fireRateBoostFull = 6;
      }
      game.effects.shockwave(p.pos, THEME.rate, 6, 0.55);
      game.sfx.itemSurge();
    },
}));
