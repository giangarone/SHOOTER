import { defineActiveItem } from '../shared.js';

export const id = 'itemRage';

export default defineActiveItem(({ THREE, THEME, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'OVERDRIVE',
    charge: 60,
    theme: THEME.damage,
    // Rides damageBoostEnd, the same field the RAGE pickup uses, so it expires
    // through machinery that already exists and shows in the buff strip without
    // being taught to. Math.max against whatever is already running, because a
    // rage pickup landing on top of this must not DOWNGRADE it to 1.5x - the
    // shorter of two overlapping boosts still wins the expiry, which is the
    // honest reading of "for 5 seconds".
    effects: [['2x DAMAGE FOR 10s', GOOD]],
    use: (game) => {
      const p = game.player;
      p.damageMult = Math.max(p.damageMult, 2);
      // The length goes with the deadline, and ONLY when this write wins it:
      // five seconds landing under a rage pickup's remaining ten must leave
      // the HUD chip measuring against the ten it is actually counting down.
      const end = game.time + 10;
      if (end > p.damageBoostEnd) {
        p.damageBoostEnd = end;
        p.damageBoostFull = 10;
      }
      game.effects.shockwave(p.pos, THEME.damage, 6, 0.6);
    },
}));

export const icon = [
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '...........42...........',
  '..........4432..........',
  '.........443332.........',
  '........44333332........',
  '.......4432223332.......',
  '......44322..23332......',
  '.....44322....23332.....',
  '....44322..21..23332....',
  '...44322..2221..23332...',
  '..44322..222221..23332..',
  '..2322..22111221..2322..',
  '...22..2211..1221..22...',
  '......2221....2221......',
  '...2222222222222222221..',
  '...2222200000000222221..',
  '...2222000000000022221..',
  '..12222222222222222221..',
  '...1111111111111111111..',
  '........................',
];
