import { defineActiveItem } from '../shared.js';

// ---- things left in the arena ------------------------------------------
export const id = 'itemTurret';

export default defineActiveItem(({ THREE, THEME, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'LITTLE BROTHER',
    charge: 40,
    theme: THEME.feed,
    // FIRE FROM SOMEWHERE THE PLAYER IS NOT. That is the only thing in this
    // game a second gun can buy, and it is worth a slot: a turret behind the
    // crowd means the crowd is taking fire while it walks toward you, which is
    // a position no amount of the player's own damage can create.
    //
    // ONE OF THE PLAYER'S OWN SHOTS PER ROUND, twice a beat, for fifteen
    // seconds - so it scales with the build instead of falling off it, and it
    // is still placement rather than damage: everything it does, the player
    // could have done by standing there, and standing there is the thing the
    // turret is buying them out of.
    //
    // THROWN, NOT PLACED. It used to be set down a step and a half in front,
    // which made an item whose entire decision is WHERE into one with no
    // decision at all. Now it goes where it is aimed - across the room, behind
    // the crowd - which is the only place a second gun is worth having.
    effects: [['THROW AN AUTO-TURRET,', GOOD], ['IT FIRES FOR 15s', NOTE]],
    use: (game) => {
      const p = game.player;
      p.muzzleInto(_v);
      facing(game);
      game.deploy(new Lob(game, _v, _dir, 'turret', p.getEffectiveDamage(p.weapon.damage)));
      game.sfx.itemDeploy();
    },
}));

export const icon = [
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........222222221.......',
  '........222222221.......',
  '........222222221.......',
  '......2222222222221.....',
  '......2222233332221.....',
  '......2222333333221.....',
  '.222222222333333221.....',
  '.111112222233332221.....',
  '......2222223322221.....',
  '......2222222222221.....',
  '......1122222221111.....',
  '........21121121........',
  '.......211.21.121.......',
  '......211..21..121......',
  '.....211...21...121.....',
  '...2211....21....1221...',
  '...211.....21.....121...',
  '...11......11......11...',
  '........................',
];
