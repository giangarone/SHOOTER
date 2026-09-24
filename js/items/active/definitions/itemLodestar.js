import { defineActiveItem } from '../shared.js';

// ---- the shop, and the floor -------------------------------------------
export const id = 'itemLodestar';

const ITEM_THEME = 0xffc400;

export default defineActiveItem(({ THREE, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'LODESTAR',
    charge: 60,
    theme: ITEM_THEME,
    // THE WAVE-CLEAR SWEEP, ON DEMAND. Every orb and every pickup in the arena
    // comes in at once - the same sweep a cleared wave already does for free,
    // which is exactly why this is cheap: the player is not buying the
    // pickups, they are buying them EARLY, in the middle of a fight where
    // walking across the room to a health drop is what would have killed them.
    //
    // Thirty seconds. It pays nothing on a clean floor, so it has to be there
    // on the frame the floor is covered.
    effects: [['PULL EVERYTHING', GOOD], ['ON THE FLOOR TO YOU', NOTE]],
    use: (game) => {
      game.money.vacuum();
      // `true` applies buff pickups NOW rather than banking them for the next
      // wave - see _vacuumPickups. The wave-clear sweep banks them because the
      // wave is over; this one is pressed mid-fight, and a rage that started
      // counting down at the next wave start would be a rage the player never
      // got.
      game._vacuumPickups(true);
      game.effects.shockwave(game.player.pos, ITEM_THEME, 12, 0.7);
      game.sfx.pickupMagnet();
      game.sfx.itemSurge();
    },
}));

export const icon = [
  '........................',
  '.....42.................',
  '....4432...21...........',
  '....4332..2221..........',
  '....2322.222221.........',
  '.....22..222221.........',
  '........22222221........',
  '.....22222222222221.....',
  '..22222222333322222221..',
  '..12222223333332222211..',
  '...122223333333322211...',
  '....2222333333332221....',
  '....1222333333332211....',
  '.....12233333333211..42.',
  '......222333333221..4432',
  '......222233332221..4332',
  '......222222222221..2222',
  '......222222222221......',
  '......222111112221......',
  '......1111....1111......',
  '......1..........1......',
  '........................',
  '........................',
  '........................',
];
