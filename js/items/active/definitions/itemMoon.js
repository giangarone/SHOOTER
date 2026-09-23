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
    theme: THEME.moon,
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
      // Moonlight-coloured, not gravity-blue: the whole item is the moon, and
      // the white is what makes the totem read as one from across the arena.
      game.effects.shockwave(p.pos, THEME.moon, 7, 0.7);
      game.effects.burst(p.eyeInto(_v), THEME.moon, 22, 4, 3, 0.9);
      game.sfx.itemBlink();
    },
    // And the floor is a floor again. Written back rather than trusted to
    // expire, on every window item's rule: the running list is torn down at
    // a wave boundary, and a multiplier that outlived its chip would be
    // gravity nobody was granted.
    end: (game) => {
      game.player.gravityMult = 1;
      game.effects.shockwave(game.player.pos, THEME.moon, 3.5, 0.35);
    },
}));

export const icon = [
  '........................',
  '........................',
  '........................',
  '........00000000........',
  '......004444444400......',
  '.....04444444444440.....',
  '....0444444444444430....',
  '....0444224444444310....',
  '...044422214444433310...',
  '...044422114444443310...',
  '...044441144444443330...',
  '...044444444444221330...',
  '...044444444442221330...',
  '...044214444442211330...',
  '...044114444444113310...',
  '...044444444444433310...',
  '....0444344444433310....',
  '....0443333443333310....',
  '.....03133333333110.....',
  '......001133331100......',
  '........00000000........',
  '........................',
  '........................',
  '........................',
];
