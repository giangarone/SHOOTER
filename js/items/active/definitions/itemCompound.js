import { defineActiveItem } from '../shared.js';

export const id = 'itemCompound';

const ITEM_THEME = 0xe53935;

export default defineActiveItem(({ THREE, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'COMPOUND INTEREST',
    charge: 20,
    theme: ITEM_THEME,
    // GRAFT'S SIBLING, IN DAMAGE. One percent is deliberately almost nothing:
    // pressed once it is invisible, and that is the point - this is the only
    // item in the pool that is worth carrying rather than worth pressing, and
    // a run that keeps it from wave four is a run that presses it twenty-odd
    // times and finishes with a quarter more gun than it started with.
    //
    // TWENTY POINTS AND NOT SIXTY, unlike GRAFT. Three max health is a real
    // number the moment it lands; one percent is not, and an item whose payout
    // only exists in aggregate has to be affordable often enough to aggregate.
    //
    // COMPOUNDING, as the name promises: each press is a percent of what the
    // last one left, so the gain accelerates very slightly. Over a run that is
    // a rounding error, and it is the honest reading of the word.
    effects: [['+1% DAMAGE', GOOD], ['PERMANENT, COMPOUNDS', NOTE]],
    use: (game) => {
      const p = game.player;
      p.compoundMult *= 1.01;
      game.effects.shockwave(p.pos, ITEM_THEME, 5, 0.5);
      game.effects.burst(p.eyeInto(_v), 0xe53935, 20, 5, 3, 0.6);
      game.ui.banner('+1% DAMAGE');
      game.sfx.itemGraft();
    },
}));

export const icon = [
  '........................',
  '........................',
  '.....2221.........42....',
  '....111111.......4422...',
  '...21....21......422....',
  '...11....11.....442.....',
  '..21......21...4422.....',
  '..121....211..4422......',
  '...21....21..4422.......',
  '...11222111.4422........',
  '.....1111..4422.........',
  '...........422..........',
  '..........442...........',
  '.........4422..2221.....',
  '........4422.21111121...',
  '.......4422..21....21...',
  '......4422..211....121..',
  '.....4422...11......11..',
  '.....422.....21....21...',
  '....442......11....11...',
  '...2422.......122211....',
  '....22.........1111.....',
  '........................',
  '........................',
];
