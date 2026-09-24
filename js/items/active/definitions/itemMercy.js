import { defineActiveItem } from '../shared.js';

export const id = 'itemMercy';

export default defineActiveItem(({ THREE, THEME, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'LAST RITES',
    charge: 40,
    theme: THEME.executioner,
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
      game.effects.shockwave(game.player.pos, THEME.executioner, 26, 0.8);
      game.sfx.itemRites();
    },
}));

export const icon = [
  '........................',
  '........................',
  '........................',
  '........................',
  '........22222221........',
  '.......2222222221.......',
  '......222222222221......',
  '.....22222222222221.....',
  '.....22000222200021.....',
  '.....22000022000021.....',
  '.....20000022000001.....',
  '.....22000022000021.....',
  '.....22222222222221.....',
  '.....22222222222221.....',
  '.....12222332222211.....',
  '......122333022211......',
  '.......1233332221.......',
  '........432332221.......',
  '.44444444333333334444442',
  '.22222223333333322222222',
  '........111113221.......',
  '.............22.........',
  '........................',
  '........................',
];
