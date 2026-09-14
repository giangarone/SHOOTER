import { defineActiveItem } from '../shared.js';

export const id = 'itemHeadCount';

export default defineActiveItem(({ THREE, THEME, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'HEAD COUNT',
    charge: 20,
    theme: THEME.hoard,
    // A HUNDRED DOLLARS A HEAD, PAID FOR NOT HAVING KILLED THEM YET. It is the
    // one item in the pool that is worth MORE at the start of a wave than at
    // the end of one, which is a shape nothing else here has - and it is the
    // reason the charge is cheap: an item pressed on the opening frame of a
    // fight has to be affordable out of the last one.
    //
    // IT CANNOT BE FARMED, and the reason is the same one the charge meter
    // relies on: enemies arrive on the wave's own schedule and nothing the
    // player does adds one. Standing still with the button held pays exactly
    // once per meter, and the meter is filled by killing.
    //
    // PAID AS ORBS ON THE FLOOR, through _dropMoney like every other credit in
    // the game, so it takes MIDAS and the flawless streak and is swept up by
    // the magnet - a payout that went straight into the balance would be the
    // one source none of those ever saw.
    effects: [['GAIN $100 PER ENEMY', GOOD], ['ALIVE RIGHT NOW', NOTE]],
    use: (game) => {
      const p = game.player;
      let n = 0;
      for (const e of game.enemies) if (!e.dead) n++;
      if (!n) {
        game.sfx.denied();
        game.effects.shockwave(p.pos, THEME.hoard, 3, 0.3);
        return;
      }
      game._dropMoney(p.pos, 100 * n);
      game.money.vacuum(0.4);
      game.effects.shockwave(p.pos, THEME.hoard, 9, 0.6);
      game.ui.banner('COUNTED ' + n);
      game.sfx.credits();
    },
}));
