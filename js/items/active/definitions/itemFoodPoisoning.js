import { defineActiveItem } from '../shared.js';

export const id = 'itemFoodPoisoning';

export default defineActiveItem(({ THREE, THEME, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'FOOD POISONING',
    charge: 40,
    theme: THEME.poison,
    // BRIMSTONE IN THE OTHER ELEMENT, AT THE OTHER SHAPE. Fire is three
    // seconds and a high rate; poison everywhere in this game is long and
    // patient (see status.js), so this is eight seconds of the whole room
    // going down slowly - and the difference on the floor is that a crowd
    // BRIMSTONE would have killed outright is instead a crowd that dies while
    // the player deals with something else.
    //
    // THE FIXED POISON BASE PER TICK. Poison is a status with its own value,
    // not another route through the weapon's damage stat.
    effects: [['POISON ALL ENEMIES', GOOD], ['FOR 8s', NOTE]],
    use: (game) => {
      let n = 0;
      const dose = game.player.poisonTickDamage;
      for (const e of game.enemies) {
        if (e.dead) continue;
        e.applyStatus('poison', 8, dose);
        game.effects.impact(e.pos, 0x39d353, 6, 3, 2.5, 0.5);
        n++;
      }
      game.effects.shockwave(game.player.pos, THEME.poison, 30, 0.9);
      if (n) game.effects.addShake(0.2);
      game.sfx.itemBlast();
    },
}));

export const icon = [
  '........................',
  '......2....2....2.......',
  '......22...22...22......',
  '.......42...42...42.....',
  '.......42...42...42.....',
  '......422..422..422.....',
  '.....422..422..422......',
  '....242..242..242.......',
  '.....42...42...42.......',
  '.....22...22...22.......',
  '......42...42...42......',
  '......42...42...42......',
  '..22222222222222222221..',
  '..111111111111111111111.',
  '..111111111111111111111.',
  '...122222222222222211...',
  '....2222222222222221....',
  '....1222222222222211....',
  '.....22222222222221.....',
  '.....12222222222211.....',
  '......112222222211......',
  '........222222221.......',
  '........111111111.......',
  '........................',
];
