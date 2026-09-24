import { defineActiveItem } from '../shared.js';

export const id = 'itemRoulette';

const ITEM_THEME = 0xff5252;

export default defineActiveItem(({ THREE, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'SIX CHAMBERS',
    charge: 36,
    theme: ITEM_THEME,
    // THE ONLY ITEM IN THE POOL THE PLAYER CANNOT PLAN AROUND. Fifty-fifty
    // between a full heal and one health, which is worth pressing at almost
    // any health total below half and worth nothing above it - so the decision
    // is not whether to gamble, it is when the gamble is free.
    //
    // THE SPIN IS SIX TENTHS OF A SECOND OF NOTHING HAPPENING, and it is the
    // most important part. Resolved on the frame of the press this is a number
    // changing; held for a beat with a cylinder turning under it, it is a
    // gamble the player watches land. Nothing else in the game asks them to
    // wait for an answer.
    effects: [['COIN TOSS:', NOTE], ['FULL HEAL OR 1 HP', GOOD]],
    duration: 0.6,
    hud: false,
    use: (game, s) => {
      // Rolled NOW and revealed later, not rolled at the reveal. If the coin
      // were tossed at the end, a player killed during the spin would have
      // died to an outcome that had not happened yet.
      s.won = Math.random() < 0.5;
      game.sfx.itemSpin();
      game.effects.shockwave(game.player.pos, ITEM_THEME, 5, 0.6);
    },
    tick: (game, s, dt) => {
      s.t = (s.t || 0) + dt;
      s.click = (s.click || 0) - dt;
      if (s.click > 0) return;
      // The clicks come FASTER as the cylinder slows, which is backwards for a
      // real revolver and exactly right for a countdown: the ear reads
      // accelerating ticks as an arrival.
      s.click = 0.14 - Math.min(0.09, s.t * 0.13);
      game.effects.impact(game.player.eyeInto(_v), 0xff5252, 3, 2, 1.5, 0.2);
    },
    end: (game, s) => {
      const p = game.player;
      if (s.won) {
        p.health = p.maxHealth;
        // The winning flash announces health, while the item's own red stays
        // on its pedestal and the losing result.
        game.effects.shockwave(p.pos, 0x00e676, 10, 0.7);
        game.effects.burst(p.eyeInto(_v), 0x8affc1, 40, 7, 4, 0.9);
        game.ui.banner('LOADED');
        game.sfx.itemHeal2();
      } else {
        p.health = 1;
        p.clearCarnage();
        game.effects.shockwave(p.pos, ITEM_THEME, 10, 0.7);
        game.effects.burst(p.eyeInto(_v), 0xff2d6f, 40, 7, 4, 0.9);
        game.ui.banner('EMPTY');
        game.ui.damage();
        game.sfx.hurt();
      }
      game.effects.addShake(0.3);
    },
}));

export const icon = [
  '........................',
  '........................',
  '........22222221........',
  '......222222222221......',
  '.....22222233222221.....',
  '....2222223333222221....',
  '...222222233332222221...',
  '...220000233332000021...',
  '..22200002233220000221..',
  '..22200000222200000221..',
  '..22200002200220000221..',
  '..22220022000022002221..',
  '..22220022000022002221..',
  '..22200002200220000221..',
  '..22200000222200000221..',
  '..12200002200220000211..',
  '...220000200002000021...',
  '...122222200002222211...',
  '....1222220000222211....',
  '.....12222200222211.....',
  '......112222222111......',
  '........11111111........',
  '........................',
  '........................',
];
