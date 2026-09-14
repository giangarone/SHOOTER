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
