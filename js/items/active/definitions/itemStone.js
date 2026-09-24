import { defineActiveItem } from '../shared.js';

export const id = 'itemStone';

const ITEM_THEME = 0xff2d6f;

export default defineActiveItem(({ THREE, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'BLOOD FROM STONE',
    charge: 30,
    theme: ITEM_THEME,
    // MONEY BECOMES MEDICINE, and only while it is running - which turns a
    // wave's payout into a heal exactly once, and makes the press a question
    // about timing rather than about health. Best used on the corpse of
    // something big, which is the same moment the floor is covered.
    //
    // Eight seconds, not five. Five almost never overlaps an actual payout:
    // orbs arrive on a kill and are picked up over the following few seconds,
    // and a window shorter than the collection is a window that mostly misses.
    effects: [['CREDITS PICKED UP', GOOD], ['ALSO HEAL 1 HP, 8s', NOTE]],
    duration: 8,
    use: (game) => {
      game.player.orbHealEnd = game.time + 8;
      game.money.vacuum();
      game.effects.shockwave(game.player.pos, ITEM_THEME, 8, 0.55);
      game.sfx.itemSurge();
    },
    end: (game) => { game.player.orbHealEnd = 0; },
}));

export const icon = [
  '........................',
  '........................',
  '........................',
  '........................',
  '........002221..........',
  '......2220222222221.....',
  '.....222200222222221....',
  '...22222220222223221....',
  '...22222220022223221....',
  '...22222220022223221....',
  '...22222200222233321....',
  '...222220022223333321...',
  '...222200022223333321...',
  '...222200022223333321...',
  '...222220002223333321...',
  '...222222002222333221...',
  '...112222000222222111...',
  '.....11222002222111.....',
  '.......1122022211.......',
  '.........1112111........',
  '............11..........',
  '........................',
  '........................',
  '........................',
];
