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

export const icon = [
  '........................',
  '......0.................',
  '.....030................',
  '.....030................',
  '....033300..............',
  '.....033300000000.......',
  '....02222222222222000...',
  '...0222222222222222220..',
  '...02222222222222222220.',
  '...0222222222222222220..',
  '....02222222222222220...',
  '.....00222222222200.....',
  '.......0022222220.......',
  '.........0222220........',
  '........0333330.........',
  '........0333330.........',
  '.......03333330.........',
  '......0333333300........',
  '.....033333333330.......',
  '.....030033330330.......',
  '....030..0330..030......',
  '...030....030...030.....',
  '...00.....030....00.....',
  '........................',
];
