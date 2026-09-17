import { defineActiveItem } from '../shared.js';

export const id = 'itemInferno';

export default defineActiveItem(({ THREE, THEME, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST, BURN_TICK, POISON_TICK }) => ({
    name: 'BRIMSTONE',
    charge: 40,
    theme: THEME.fire,
    // A FIXED RATE, not the player's own burn. Incendiary may not be owned -
    // most runs it is not - and an item that did nothing at all until you
    // happened to draft an unrelated passive item would be the only item in
    // the pool whose text is a lie on the card it is read from.
    //
    // Three seconds is short and the rate is high, which is the shape fire has
    // everywhere else in this game (see status.js): it is a reason to press
    // the advantage now rather than a clock to wait out.
    //
    // TWICE THE FLAT BURN TICK, at two ticks a beat, on every enemy at once.
    effects: [['BURN ALL ENEMIES', GOOD], ['FOR 3s', NOTE]],
    use: (game) => {
      let n = 0;
      const burn = BURN_TICK * 2;
      for (const e of game.enemies) {
        if (e.dead) continue;
        e.applyStatus('burn', 3, burn);
        // Lit one at a time from the player outward would be the nicer
        // animation and the wrong read: the item is ONE event, and thirty
        // little fires starting on the same frame is what says so.
        game.effects.impact(e.pos, 0xff7a18, 6, 3, 2.5, 0.5);
        n++;
      }
      game.effects.shockwave(game.player.pos, THEME.fire, 30, 0.9);
      if (n) game.effects.addShake(0.2);
      game.sfx.itemBlast();
    },
}));
