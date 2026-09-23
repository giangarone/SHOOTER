import { defineActiveItem } from '../shared.js';

export const id = 'itemSnowman';

export default defineActiveItem(({ THREE, THEME, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, Snowman, SNOWMAN_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'SNOWMAN',
    charge: 40,
    theme: THEME.ice,
    // ORGAN GRINDER'S LURE, POINTED AT THE CROWD INSTEAD OF THE CLOCK. The
    // monkey buys five untouchable seconds and ends them with a blast; the
    // snowman is the patient version - it never goes off on its own, it just
    // STANDS there being what the room wants, and every body that takes the
    // bait and lands a blow on it pays for the hit in a ring of cold. The
    // whole item is the decoy plus the lesson, and the class that owns both
    // is in js/deploy.js (see Snowman, and `onHit` on the lure in main.js).
    //
    // PLACED WHERE YOU ARE AIMING, A STEP AWAY - not lobbed across the room.
    // The monkey's flight is part of its design (the crowd turns toward a
    // point behind them); the snowman is a wall, and walls go between you
    // and the thing. It melts at eight seconds rather than exploding, so the
    // end of the decoy is never a threat to the person standing nearest to
    // it, which is usually you.
    effects: [['DEPLOY A SNOWMAN DECOY', GOOD], ['ENEMIES ATTACK IT; HITS ON IT', NOTE], ['FREEZE THE ATTACKERS', GOOD]],
    use: (game) => {
      const p = game.player;
      facing(game);
      const x = Math.max(-BOUND + 1, Math.min(BOUND - 1, p.pos.x + _dir.x * 2.2));
      const z = Math.max(-BOUND + 1, Math.min(BOUND - 1, p.pos.z + _dir.z * 2.2));
      game.deploy(new Snowman(game, x, z, p.pos.y));
      game.effects.shockwave(p.pos, THEME.ice, 5, 0.55);
      game.effects.burst(p.eyeInto(_v), 0xaee9ff, 18, 5, 3, 0.5);
      game.sfx.itemDeploy();
    },
}));

export const icon = [
  '........................',
  '........000000..........',
  '.......02222220.........',
  '.......02222220.........',
  '.......00000000.........',
  '......2222222222........',
  '.......0000000..........',
  '.......02222220.........',
  '.......02020220.........',
  '......0222222220..02....',
  '......0222032220.020....',
  '..02..0222222220020.....',
  '.020..0022200220020.....',
  '0200..0222222222200.....',
  '.020.0222222222222200...',
  '..0..02222222222222220..',
  '.....022222022222222220.',
  '....0222222202222222220.',
  '....0222222220222222220.',
  '...02222222220222222220.',
  '...02222222222222222220.',
  '....002222222222222200..',
  '......00000000000000....',
  '........................',
];
