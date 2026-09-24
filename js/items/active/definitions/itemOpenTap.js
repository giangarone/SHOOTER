import { defineActiveItem } from '../shared.js';

export const id = 'itemOpenTap';

const ITEM_THEME = 0xffd180;

const OPEN_TAP_TIME = 6;

export default defineActiveItem(({ THREE, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, Snowman, SNOWMAN_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'OPEN TAP',
    charge: 30,
    theme: ITEM_THEME,
    // OPENING SALVO's WINDOW, BOUGHT BY THE PLAYER rather than granted by the
    // wave. The machinery is deliberately the same one - Player.tryShoot's
    // free-fire branch reads both deadlines off the same lines - because
    // "the trigger does not bill" is one mechanic and should never have
    // learned two answers to whether the magazine moves, whether reloads
    // interrupt, or whether an empty gun still fires. What the press adds is
    // WHEN: the wave pays it at the start, and this opens it at the moment
    // the room is fullest.
    //
    // A RUNNING RELOAD IS POURING THE DRINK DOWN THE SINK. The card's second
    // promise is "no reloads", so the press seats the reload's clock rather
    // than letting the player stand through it inside their own window - the
    // free branch fires from an empty magazine anyway, which is the whole
    // reason a reload happening here is pure waste.
    //
    // NO DAMAGE IN IT AT ALL, which is why it costs half of OVERDRIVE: it is
    // the same trigger pulls you were going to make, with the ammunition
    // bill torn up and the reload beat handed back.
    effects: [['FREE FIRE FOR 6s', GOOD], ['NO AMMO SPENT, NO RELOADS', NOTE]],
    duration: OPEN_TAP_TIME,
    use: (game) => {
      const p = game.player;
      p.freeFireEnd = Math.max(p.freeFireEnd, game.time + OPEN_TAP_TIME);
      if (p.reloading > 0) p.reloading = 0;
      game.effects.shockwave(p.pos, ITEM_THEME, 6, 0.6);
      game.effects.burst(p.eyeInto(_v), 0xffd180, 20, 5, 3, 0.55);
      game.sfx.itemSurge();
    },
    end: (game) => { game.player.freeFireEnd = 0; },
}));

// THE BRASS TAP, RUNNING. Valve and pipe up top, a stream of live rounds
// pouring out of the spout into a waiting tankard - six seconds where
// the trigger does not bill and the reload never comes.
export const icon = [
  '........................',
  '........................',
  '......433334............',
  '........33..............',
  '....4333333333..........',
  '....4222222223..........',
  '....2222222223..........',
  '............233.........',
  '.............343........',
  '.............343........',
  '.............333........',
  '.............333........',
  '.............343........',
  '.............333........',
  '.............331........',
  '..........4443344.......',
  '..........433333331.....',
  '..........42222222132...',
  '..........42222222130...',
  '..........42222222132...',
  '..........211111111.....',
  '..........111111111.....',
  '........................',
  '........................',
];
