import { defineActiveItem } from '../shared.js';

export const id = 'itemTopOff';

const ITEM_THEME = 0xff2d6f;

export default defineActiveItem(({ THREE, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, Snowman, SNOWMAN_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'TOP OFF',
    charge: 40,
    theme: ITEM_THEME,
    // (The name was SECOND WIND until it met the pool: the stamina passive of
    // that name got here first, and two offers that share a name are two
    // cards a totem cannot tell apart - see "no two offers share a name" in
    // the third-pool suite. The trade below is unchanged.)
    //
    // OPEN VEIN, RUN BACKWARDS. That one sells a full reserve for fifty
    // health; this sells thirty health for a FULL RELOAD - magazine seated,
    // reserve topped, no standing through the clock. The pair disagree about
    // which side of the trade deserves the other, which is exactly the
    // argument the pool is for: the run that bought a belt of six hundred
    // rounds is carrying all the health it will ever need, wrong-side up.
    //
    // pay(), NOT DAMAGE - the cost is a PRICE, priced on the card, so it
    // steps past Evasion, shields and the thorns refunds on the same grounds
    // as BLOOD PRICE: the player pressed the button. It cannot be the thing
    // that kills them; refusing under thirty would cheapen exactly that
    // promise, and the gate is what keeps the press worth the printed thirty
    // instead of quietly costing whatever was left.
    //
    // A RELOAD THAT WAS RUNNING IS SIMPLY OVER. The refill is the seat AND
    // the magazine, so the clock between you and full is part of what the
    // thirty bought - leaving it ticking would be reloading the gun with
    // rounds it already holds.
    effects: [['LOSE 30 HP', NOTE], ['FULL MAGAZINE + RESERVE', GOOD]],
    ready: (game) => game.player.health > 30,
    use: (game) => {
      const p = game.player;
      pay(p, 30);
      p.mag = p.magSize;
      p.reserveAmmo = p.maxReserve;
      if (p.reloading > 0) p.reloading = 0;
      game.ui.flashReserve();
      game.ui.banner('TOP OFF');
      game.effects.shockwave(p.pos, ITEM_THEME, 7, 0.6);
      game.effects.burst(p.eyeInto(_v), 0xff2d6f, 20, 5, 3, 0.55);
      game.effects.burst(p.pos, 0xffd600, 16, 4, 3, 0.4);
      game.ui.damage();
      game.sfx.itemAmmo();
    },
}));

export const icon = [
  '........................',
  '........................',
  '..........441.1.........',
  '..........422411........',
  '..........42221.........',
  '..........42221.........',
  '.........4422221........',
  '.........4222221........',
  '.........4222221........',
  '.........4433331........',
  '.........4343331..41....',
  '.....1...4333331..41....',
  '....441..4333331..141...',
  '...44221.4333331...41...',
  '...44321.4333331..411...',
  '...12211.4333331..41....',
  '....111..4333331..11....',
  '.........4333331........',
  '.........4333331........',
  '.........4222221........',
  '.........1111111........',
  '........................',
  '........................',
  '........................',
];
