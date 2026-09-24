import { defineActiveItem } from '../shared.js';

export const id = 'itemGuard';

export default defineActiveItem(({ THREE, THEME, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'AEGIS',
    charge: 60,
    theme: THEME.holy,
    // invulnEnd is read as the FIRST line of both damage sinks in main.js, so
    // this needs no new guard anywhere - but both of those sinks return in
    // silence, which means five seconds of it look exactly like five seconds of
    // not being shot at. The tell is the caller's job: main.js holds a vignette
    // and a buff chip for the duration, or the strongest item in the pool is
    // also the one the player cannot tell is running.
    effects: [['INVINCIBLE FOR 8s', GOOD]],
    use: (game) => {
      const p = game.player;
      p.invulnEnd = Math.max(p.invulnEnd, game.time + 8);
      game.effects.shockwave(p.pos, THEME.holy, 7, 0.7);
    },
}));

export const icon = [
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........22222221........',
  '......211111111121......',
  '.....211........121.....',
  '....211....42....121....',
  '...211..42222242..121...',
  '...11..422....232..11...',
  '..21..422.4442.232..21..',
  '..21..22..4332..22..21..',
  '..21..2...2222...2..21..',
  '..21.42..........42.21..',
  '.22222222222222222222221',
  '.22222222222222222222221',
  '.22222222222222222222221',
  '.11111111111111111111111',
  '....11111111111111111...',
  '........................',
  '........................',
];
