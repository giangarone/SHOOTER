import { defineActiveItem } from '../shared.js';

// ---- things left in the arena (the second helping) ----------------------
export const id = 'itemMolotov';

export default defineActiveItem(({ THREE, THEME, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'MOLOTOV',
    charge: 20,
    theme: THEME.fire,
    // FIREBREAK IS A LINE YOU HIDE BEHIND; THIS IS A CIRCLE YOU PUT SOMEWHERE
    // ELSE. The wall stands where the player is and stops what is coming; the
    // bottle is thrown across the room and makes the place the crowd is
    // WALKING THROUGH cost them something. Twenty seconds is most of a wave -
    // long enough that it is worth throwing at a spawn point rather than at a
    // body.
    //
    // IT BURNS, IT DOES NOT BLAST. There is no impact damage at all: what
    // lands is ground, and ground in this game sets fire to whatever stands in
    // it on the beat like every other fire (see FireWall, _updateFire). An
    // item that also hit for a number on the throw would be two damage systems
    // on one bottle, only one of which the player can see.
    //
    // AND IT CANNOT HURT THE PLAYER, on FALLING SKY's terms: every hazard in
    // this game is a question answered by moving, and it can be answered
    // because the player knows who threw it. The one item that DOES burn its
    // own thrower is FLOOR IS LAVA, and there the whole point is that the
    // floor is gone.
    effects: [['THROW A FIRE BOMB:', GOOD], ['BURNING GROUND, 20 SEC', NOTE]],
    use: (game) => {
      const p = game.player;
      p.muzzleInto(_v);
      facing(game);
      // The burn is snapshotted at the throw, like every other fire in the
      // game; see the note on Lob.
      game.deploy(new Lob(game, _v, _dir, 'molotov', p.fireTickDamage * 2));
      game.sfx.itemDeploy();
    },
}));

export const icon = [
  '...............2........',
  '..............442.......',
  '.............44332......',
  '.............43332......',
  '............4433332.....',
  '..........2222333332....',
  '..........2222333222....',
  '..........22223322......',
  '..........2221222.......',
  '.........22221..........',
  '........2222221.........',
  '........2222221.........',
  '.......222222221........',
  '.......222222221........',
  '.......222222221........',
  '.......222222221........',
  '.......223333331........',
  '.......223333331........',
  '.......223333331........',
  '.......223333331........',
  '.......223333331........',
  '.......111111111........',
  '........................',
  '........................',
];
