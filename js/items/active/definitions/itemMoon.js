import { defineActiveItem } from '../shared.js';

export const id = 'itemMoon';

// A third of the arena's pull. JUMP_V against it tops out near three times
// the standing jump's height, and a long fall takes long enough to steer -
// the card's "higher" and "slower" are the same number read from opposite
// ends of the arc.
const MOON_PULL = 0.35;

export default defineActiveItem(({ THREE, THEME, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, Snowman, SNOWMAN_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'MOON',
    charge: 30,
    theme: THEME.gravity,
    // FIFTEEN SECONDS IN WHICH THE FLOOR IS A SUGGESTION. The whole mechanic
    // is one multiplier in Player.update's gravity line (see
    // player.gravityMult): the jump impulse is untouched, so everything the
    // player's legs already know how to do simply carries further - jumps go
    // up slower and come down slower, dashes aimed at the sky keep their
    // climb, and the crowd keeps its own pull, which is the part worth
    // thirty points: nobody else in the arena gets to come up after you.
    //
    // IT BUYS VERTICAL TIME, NOT INVULNERABILITY. A player mid-leap is still
    // entirely a target - the item is repositioning, the way COLD SPOT is,
    // and priced in the same neighbourhood for the same reason.
    effects: [['LOW GRAVITY FOR 15s', GOOD], ['JUMP HIGHER, FALL SLOWER', NOTE]],
    duration: 15,
    use: (game) => {
      const p = game.player;
      p.gravityMult = MOON_PULL;
      game.effects.shockwave(p.pos, THEME.gravity, 7, 0.7);
      game.effects.burst(p.eyeInto(_v), 0x536dfe, 22, 4, 3, 0.9);
      game.sfx.itemBlink();
    },
    // And the floor is a floor again. Written back rather than trusted to
    // expire, on every window item's rule: the running list is torn down at
    // a wave boundary, and a multiplier that outlived its chip would be
    // gravity nobody was granted.
    end: (game) => {
      game.player.gravityMult = 1;
      game.effects.shockwave(game.player.pos, THEME.gravity, 3.5, 0.35);
    },
}));

export const icon = [
  '........................',
  '...........444..........',
  '.........00000000.......',
  '.......002222222200.....',
  '......02222222222220....',
  '.....0222222222222220...',
  '....022222222222222220..',
  '....022222222222222220..',
  '...02222200222222222220.',
  '...02222000022222222220.',
  '...02222000022222222220.',
  '...02222200222222222220.',
  '...02222220022222222220.',
  '....02222222222222222...',
  '....022222222222222220..',
  '.....0222220022222220...',
  '......02200002222220....',
  '.......002222222200.....',
  '.........00000000.......',
  '....44..............44..',
  '.....44............44...',
  '........................',
  '........................',
  '........................',
];
