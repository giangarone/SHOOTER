import { defineActiveItem } from '../shared.js';

export const id = 'itemBomb';

export default defineActiveItem(({ THREE, THEME, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'SHORT FUSE',
    charge: 30,
    theme: THEME.blast,
    // THREE SECONDS IS THE ITEM. Every other blast in the pool happens at the
    // moment it is asked for; this one happens where the fight is GOING to be,
    // which is a different skill and the only place in the game the player is
    // asked to use it. Thrown short and it kills them, thrown long and it
    // kills nothing.
    //
    // It hurts the player for exactly that reason. A bomb that could be
    // dropped underfoot for free would never be thrown anywhere else.
    effects: [['THROW A BOMB, 3s FUSE', GOOD], ['HURTS YOU TOO', NOTE]],
    use: (game) => {
      const p = game.player;
      p.muzzleInto(_v);
      facing(game);
      game.deploy(new Bomb(game, _v.x, _v.y, _v.z, _dir.x, _dir.z));
      game.sfx.itemDeploy();
    },
}));

export const icon = [
  '........................',
  '.................2...2..',
  '..............42..2.2...',
  '.............2222.442...',
  '............22..244222..',
  '..........442....222....',
  '..........431......2....',
  '..........221......2....',
  '.......22222221.........',
  '......2222222221........',
  '.....222222222221.......',
  '....22222222222221......',
  '....22222222222221......',
  '....22222222222221......',
  '...2222222222222221.....',
  '...1222222222222211.....',
  '....22222222222221......',
  '....22222222222221......',
  '....12222222222211......',
  '.....122222222211.......',
  '......1222222211........',
  '.......11121111.........',
  '..........11............',
  '........................',
];
