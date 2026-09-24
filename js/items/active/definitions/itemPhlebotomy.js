import { defineActiveItem } from '../shared.js';

export const id = 'itemPhlebotomy';

const ITEM_THEME = 0xff2d6f;

export default defineActiveItem(({ THREE, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'PHLEBOTOMY',
    charge: 20,
    theme: ITEM_THEME,
    // WHAT IS MISSING OFF YOUR BAR, DEALT TO EVERY BODY IN THE ROOM. At full
    // health it is a dead press and at four health it is the largest number in
    // the game applied to everything at once, which makes it the only item in
    // the pool that is strongest at exactly the moment the player is weakest.
    //
    // IT COSTS NOTHING AND HEALS NOTHING. The temptation was to take the
    // health as well and make it a Martyr; the whole shape is that the player
    // is ALREADY paying - they are at nine health, they were going to be at
    // nine health anyway, and this is the one thing that turns that into an
    // advantage. Twenty points, because a wave spent at low health is its own
    // punishment and this is what makes it survivable.
    //
    // FLAT, AND NOT SCALED BY THE GUN. Every other room-wide payload in the
    // pool reads getEffectiveDamage; this one deliberately does not, because
    // the number IS the health bar - a build multiplier on top would make the
    // card's promise a lie in the one direction the player cannot check.
    effects: [['YOUR MISSING HP,', GOOD], ['DEALT TO ALL ENEMIES', GOOD]],
    use: (game) => {
      const p = game.player;
      const dmg = Math.max(0, p.maxHealth - p.health);
      if (dmg <= 0) {
        game.sfx.denied();
        game.effects.shockwave(p.pos, ITEM_THEME, 3, 0.3);
        return;
      }
      // A copy of the list, for PAY TO WIN's reason: a splitter's children are
      // pushed onto `enemies` the moment the parent dies, and something that
      // was not on the floor when the button was pressed must not be paid.
      for (const e of game.enemies.slice()) {
        if (e.dead) continue;
        game.effects.impact(e.pos, 0xff2d6f, 8, 4, 2.5, 0.4);
        game.hurtEnemy(e, dmg);
      }
      game.effects.shockwave(p.pos, ITEM_THEME, 30, 0.9);
      game.effects.addShake(0.3);
      game.sfx.itemPact();
    },
}));

export const icon = [
  '........................',
  '....21..................',
  '....221.................',
  '...22221................',
  '..2222221...............',
  '.122223321..............',
  '..122333321.............',
  '...123333321............',
  '....123333321...........',
  '.....123333321..........',
  '......123333321.........',
  '.......123333311.....2..',
  '........1233321......2..',
  '.........12321......442.',
  '..........111....2..432.',
  '...........1.....2..222.',
  '................442.....',
  '...............44332....',
  '.............2.23322....',
  '.............2..222.....',
  '............442.........',
  '...........2432.........',
  '............222.........',
  '........................',
];
