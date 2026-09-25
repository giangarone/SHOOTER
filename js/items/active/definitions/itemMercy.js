import { defineActiveItem } from '../shared.js';

export const id = 'itemMercy';

const ITEM_THEME = 0x880e4f;

export default defineActiveItem(({ THREE, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'LAST RITES',
    charge: 40,
    theme: ITEM_THEME,
    // FINISHES, IT DOES NOT KILL. Thirty percent is low enough that this is
    // never the thing that won the fight - the player already did the work -
    // and high enough that a room full of half-dead chaff clears in one press,
    // which is the moment the item exists for.
    //
    // BOSSES ARE NOT EXEMPT. They used to be, on the reasoning that an item
    // which deletes a boss's last phase would be the only boss strategy there
    // is - and at twenty-four points that was true. At forty it is a whole
    // fight's charge spent on the third of a health bar the player was already
    // going to win, and a finisher that refuses at the one moment a finisher
    // is worth pressing is a finisher nobody presses.
    effects: [['KILL EVERY ENEMY', GOOD], ['BELOW 30% HEALTH', NOTE]],
    use: (game) => {
      for (const e of game.enemies) {
        if (e.dead) continue;
        if (e.hp > e.maxHp * 0.3) continue;
        game.effects.impact(e.pos, 0xff2d6f, 10, 5, 3, 0.4);
        game.hurtEnemy(e, e.hp + 1);
      }
      game.effects.shockwave(game.player.pos, ITEM_THEME, 26, 0.8);
      game.sfx.itemRites();
    },
}));

export const icon = [
  '........................',
  '........................',
  '..........44441.........',
  '.........1422211........',
  '........1.42221.1.......',
  '.......11442422111......',
  '.......1.4224221.1......',
  '.......1.1233311.1......',
  '.......1..12211..1......',
  '.......11..421..11......',
  '........1.44221.1.......',
  '.........1422211........',
  '..........42221.........',
  '..........42221.........',
  '..........42021.........',
  '..........43231.........',
  '..........42321.........',
  '..........42221.........',
  '..........42221.........',
  '..........42221.........',
  '......4444444444441.....',
  '......1111111111111.....',
  '........................',
  '........................',
];
