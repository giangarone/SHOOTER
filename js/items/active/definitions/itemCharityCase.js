import { defineActiveItem } from '../shared.js';

export const id = 'itemCharityCase';

const CHARITY_TIME = 10;

export default defineActiveItem(({ THREE, THEME, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, Snowman, SNOWMAN_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'CHARITY CASE',
    charge: 40,
    theme: THEME.vitality,
    // THE GUN TEMPORARILY WORKS FOR YOU INSTEAD OF ON THEM. Ten seconds in
    // which the trigger still does everything a trigger does - it recoils,
    // it bills, it eats the rate picks - but the pellets land as alms: one
    // health per shot that connects, and zero damage anywhere. The crowd
    // the player is shooting at stops dying, which is the thing that keeps
    // this out of HAEMOPHAGE's apron: it is not a heal that rides a working
    // gun, it is the gun's whole output, exchanged.
    //
    // THE HEAL IS PER TRIGGER PULL THAT LANDED, on HAEMOPHAGE's own boolean
    // (see the leech block in shoot()): nine pellets into one chest is a
    // round that connected, and a magazine emptied into a wall pays for
    // nothing. The damage side is silenced in _landShot rather than at the
    // trigger so a ward eating the pellet eats the collection with it -
    // the round was stopped, not cashed.
    //
    // MELEE STILL COUNTS, because it is not the gun: EVERYONE FELT THAT
    // stacks with it, and a player who wants to fight during a charity is
    // invited to get personal.
    effects: [['10s: GUN DEALS NO DAMAGE', NOTE], ['EVERY SHOT LANDED', GOOD], ['HEALS YOU 1 HP', GOOD]],
    duration: CHARITY_TIME,
    use: (game) => {
      const p = game.player;
      p.charityEnd = Math.max(p.charityEnd, game.time + CHARITY_TIME);
      game.effects.shockwave(p.pos, THEME.vitality, 7, 0.6);
      game.effects.burst(p.eyeInto(_v), 0x00e676, 22, 5, 3, 0.6);
      game.sfx.itemHeal2();
    },
    end: (game) => {
      game.player.charityEnd = 0;
      game.effects.shockwave(game.player.pos, THEME.vitality, 3.5, 0.35);
    },
}));

export const icon = [
  // A case with a cross on it: the thing you open when you give something away.
  '........................',
  '........................',
  '.........00000..........',
  '........02111120........',
  '........02000020........',
  '.....000020000200000....',
  '....02222000000222220...',
  '...0222222222222222220..',
  '...0211111111111111120..',
  '...0211114444411111120..',
  '...0211114333411111120..',
  '...0214444333444411120..',
  '...0214344333344311120..',
  '...0214444333444411120..',
  '...0211114333411111120..',
  '...0211114444411111120..',
  '...0211111111111111120..',
  '...0222222222222222220..',
  '...0222222222222222220..',
  '....00000000000000000...',
  '........................',
  '........................',
  '........................',
  '........................',
];
