import { defineActiveItem } from '../shared.js';

export const id = 'itemDonate';

const ITEM_THEME = 0xff2d6f;

export default defineActiveItem(({ THREE, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'OPEN VEIN',
    charge: 50,
    theme: ITEM_THEME,
    // HEALTH INTO AMMUNITION, at a rate that only looks bad. A full reserve is
    // three hundred rounds and there is no other way to buy them mid-wave: the
    // ammo pickup is a drop the player does not control, and running dry in a
    // fight is the one failure that cannot be played around.
    //
    // Fifty seconds. Fifty health is already the price -
    // charging the slot for almost a whole wave on top of it means the item is
    // never the right press, which is the same as not shipping it.
    effects: [['REFILL YOUR RESERVE', GOOD], ['COSTS 50 HP', NOTE]],
    use: (game) => {
      const p = game.player;
      pay(p, 50);
      p.reserveAmmo = p.maxReserve;
      game.ui.damage();
      game.ui.flashReserve();
      game.effects.shockwave(p.pos, ITEM_THEME, 7, 0.6);
      game.effects.burst(p.eyeInto(_v), 0xff2d6f, 28, 6, 3, 0.7);
      game.sfx.itemPact();
    },
}));

export const icon = [
  '........................',
  '.....2222222221.........',
  '.....2233333331.........',
  '.....2233333331.........',
  '.....2233333331.........',
  '....222333333321........',
  '....222333333321........',
  '....222333333321........',
  '....111112221111........',
  '.........2221...........',
  '.........2221...........',
  '.........2221...........',
  '.........2221...........',
  '.........2221...........',
  '......2222222222221.....',
  '......2222222222221.....',
  '......2233333333321.....',
  '......2233333333321.....',
  '......2222222222221.....',
  '......2233333333321.....',
  '......2233333333321.....',
  '......2222222222221.....',
  '......2222222222221.....',
  '......1111111111111.....',
];
