import { defineActiveItem } from '../shared.js';

export const id = 'itemLockpick';

const ITEM_THEME = 0xb388ff;

export default defineActiveItem(({ THREE, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'LOCKPICK',
    charge: 60,
    theme: ITEM_THEME,
    // THE DEAREST THING IN THE POOL THAT IS SPENT IN THE SHOP, and it has to
    // be: what it buys is the thing every other item in this file is bought
    // WITH. (EXECUTIVE DECISION costs twice as much, and is spent in a boss
    // fight - the two never compete for the same press.) Sixty dead
    // chasers is most of a wave, and what comes back is one
    // roll of a box that would otherwise have cost a thousand dollars and
    // doubled from there.
    //
    // IT THROWS ITSELF AWAY. There is one slot, the box hands over what it
    // rolls, and taking that item is what replaces the lockpick - so this is
    // not a machine the player operates twice at one shop. It is a single
    // free roll, and the item it hands back is what the run carries out.
    // Refusing the swap is allowed and costs the roll, exactly as a paid roll
    // left to sink does; the charge is spent either way.
    //
    // SECOND OPINION'S SIBLING, priced the other way up. That one is a shop
    // press too, and it is cheap because a reroll is three cards; this is dear
    // because a box roll is the whole item catalogue.
    effects: [['A FREE MYSTERY BOX ROLL', GOOD], ['USED AT THE SHOP', NOTE]],
    // REFUSED WHERE THERE IS NO BOX TO PICK, on exactly the terms SECOND
    // OPINION is refused with no totems standing - and on the box's own
    // `canBuy`, so a press mid-spin or with an item already hanging there is
    // refused for the same reason a paid roll would be.
    ready: (game) => game.mysteryBox.canBuy,
    use: (game) => {
      game._freeBoxRoll();
      game.effects.shockwave(game.player.pos, ITEM_THEME, 6, 0.5);
      game.ui.banner('PICKED');
    },
}));

// THE QUIET ENTRY. Hook picks crossed over a studded strongbox, the
// keyhole caught mid-turn with a glint - one free roll of everything
// the shop was going to charge for.
export const icon = [
  '........................',
  '........................',
  '....44............44....',
  '....43..........3.44....',
  '......3........3........',
  '.......3......3.........',
  '........3....3..........',
  '.........3..3...........',
  '..........33............',
  '..........33............',
  '........43..34..........',
  '....433333333331........',
  '....411111111111........',
  '....422220022221........',
  '....422220422221..3.....',
  '....422220222221.343....',
  '....422222222221..3.....',
  '....424322224321........',
  '....422222222221........',
  '....211111111111........',
  '....111111111111........',
  '........................',
  '........................',
  '........................',
];
