import { defineActiveItem } from '../shared.js';

// ---- getting out of somewhere ------------------------------------------
export const id = 'itemBoot';

const ITEM_THEME = 0x82b1ff;

export default defineActiveItem(({ THREE, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'BOOTSTRAP',
    charge: 30,
    theme: ITEM_THEME,
    // STRAIGHT UP, AND THAT IS THE WHOLE DESIGN. BLINK DRIVE goes forward,
    // which is useless when what is wrong is that you are surrounded; this
    // leaves the floor entirely, and the floor is where every melee enemy in
    // the game lives. It clears the catwalks, so it is also the only way to
    // get on top of the room on purpose.
    //
    // The blast underneath is not free damage, it is the reason the launch is
    // believable - and it is priced as FOUR OF THE PLAYER'S OWN BULLETS rather
    // than as a flat number, which is what a flat 45 stopped being worth by
    // wave ten. Read live off the gun through getEffectiveDamage, so every
    // damage passive item in the build feeds it exactly the way it feeds a
    // shot, and it is still four rounds' worth at wave twenty - big enough to
    // matter under a crowd, nowhere near enough to press this for the damage.
    //
    // Thirty seconds. An escape that is not there when you need it
    // is not an escape, and this one commits the player to an arc they cannot
    // steer out of, which is its own price.
    effects: [['JUMP STRAIGHT UP,', GOOD], ['BLASTING THE GROUND', GOOD]],
    use: (game) => {
      const p = game.player;
      _v.set(p.pos.x, 0, p.pos.z);
      game._blast(_v, p.getEffectiveDamage(p.weapon.damage) * 4, 5, null, false);
      // Written straight onto the velocity, above the 22 m/s^2 in update() -
      // 17 tops out at about 6.5m, which is over the catwalks and over
      // everything in the enemy pool.
      p.vel.y = 17;
      p.onGround = false;
      p.jumpsLeft = 0;
      game.effects.shockwave(_v, ITEM_THEME, 5, 0.5);
      game.effects.burst(_v, 0xff8c1a, 30, 7, 6, 0.6);
      game.effects.addShake(0.3);
      game.sfx.itemBoot();
    },
}));

export const icon = [
  '........................',
  '........................',
  '.......22222221.........',
  '.......22222221.........',
  '.......22222221.........',
  '.......22222221.........',
  '.......22222221.........',
  '.......22222221.........',
  '.......22222221.........',
  '.......00000000.........',
  '.......00000000.........',
  '.......2222222222221....',
  '.......2222222222221....',
  '.......2222222222221....',
  '.......1112111111111....',
  '..........42............',
  '.........4432...2.......',
  '........443332.442......',
  '........433332.4332.....',
  '.......443333344332.....',
  '......4433333333332.....',
  '......22333332233222....',
  '........433332.222......',
  '........222222..........',
];
