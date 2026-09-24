import { defineActiveItem } from '../shared.js';

// ---- windows on the player ---------------------------------------------
export const id = 'itemRate';

const ITEM_THEME = 0xff9500;

export default defineActiveItem(({ THREE, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'RED LINE',
    charge: 30,
    theme: ITEM_THEME,
    // Rides fireRateMult and fireRateBoostEnd - the fire-rate PICKUP's own two
    // fields - so it expires through machinery that already exists and shows
    // in the buff strip without being taught to, exactly the way OVERDRIVE
    // rides the rage pickup's. Math.max for the same reason: a pickup landing
    // on top of this must not downgrade it.
    //
    // Six seconds at eighteen, against OVERDRIVE's five at twenty. Rate is
    // worth slightly less than damage in a game where the magazine is finite -
    // twice the rate is also twice the reloads.
    effects: [['DOUBLE FIRE RATE', GOOD], ['FOR 6s', NOTE]],
    use: (game) => {
      const p = game.player;
      p.fireRateMult = Math.max(p.fireRateMult, 2);
      const end = game.time + 6;
      if (end > p.fireRateBoostEnd) {
        p.fireRateBoostEnd = end;
        p.fireRateBoostFull = 6;
      }
      game.effects.shockwave(p.pos, ITEM_THEME, 6, 0.55);
      game.sfx.itemSurge();
    },
}));

export const icon = [
  '........................',
  '........................',
  '.........22222442.......',
  '.......22222233332......',
  '.....22111111333332.....',
  '....2211.....2223332....',
  '....211.........43332...',
  '...211.........4223332..',
  '...21.........422.4332..',
  '..221......22422..2221..',
  '..221.....22332....221..',
  '..221....220031....221..',
  '..221....120011....221..',
  '..221.....1211.....221..',
  '..121......11......211..',
  '...21..............21...',
  '...121............211...',
  '....221..........221....',
  '....1221........2211....',
  '.....11222222222111.....',
  '.......1122222111.......',
  '.........111111.........',
  '........................',
  '........................',
];
