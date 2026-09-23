import { defineActiveItem } from '../shared.js';

export const id = 'itemWalkItOff';

export default defineActiveItem(({ THREE, THEME, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, Snowman, SNOWMAN_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'WALK IT OFF',
    charge: 20,
    theme: THEME.wind,
    // THE ONLY HEAL PRICED IN FOOTSTEPS. Every other heal in the pool is a
    // number on a button; this one pays for exactly the thing a surrounded
    // player should be doing anyway - KEEP MOVING - which makes it the one
    // recovery in the game that dodging a crowd and running from a boss both
    // feed. A player who stands still to shoot gets nothing, and that is the
    // item: it is worth a press only when the next eight seconds were going
    // to be spent on feet.
    //
    // MEASURED ON THE FLOOR, like every distance in this game: metres of XZ
    // travel, so walking and sprinting pay, jumping pays nothing on the way
    // up, and the distance is accrued in fractions so the fraction carried
    // onto the next frame is never silently lost to rounding.
    effects: [['8s: WALKING HEALS YOU', GOOD], ['1 HP PER METRE', NOTE]],
    duration: 8,
    use: (game, s) => {
      const p = game.player;
      s.x = p.pos.x;
      s.z = p.pos.z;
      s.acc = 0;
      s.healed = 0;
      game.effects.shockwave(p.pos, THEME.wind, 6, 0.6);
      game.sfx.itemHeal2();
    },
    tick: (game, s) => {
      const p = game.player;
      const dx = p.pos.x - s.x;
      const dz = p.pos.z - s.z;
      s.x = p.pos.x;
      s.z = p.pos.z;
      const d = Math.hypot(dx, dz);
      // A TELEPORT IS NOT WALKING. COLD SPOT and the dash move the player
      // further in a frame than any gait covers in one; paying them out per
      // metre would make this a second heal hidden inside a movement item.
      // The cap sits above a dash's longest frame step, so everything the
      // player's LEGS actually did still counts and only jumps in position
      // are refused.
      if (d <= 1.2) s.acc += d;
      // Float dust is not a rounding decision: three strides of exactly a
      // third of a metre each are a metre, and without the nudge the third
      // one of them silently pays nothing.
      const whole = Math.floor(s.acc + 1e-6);
      if (whole <= 0) return;
      s.acc -= whole;
      // What actually LANDED is what the chip reports: a player already at
      // full health is walking for nothing, and the label telling them so is
      // the item teaching its own exchange rate.
      s.healed += p.heal(whole);
      // The chip's label is the running total rather than a clock the metre
      // is already showing - the player learns the exchange rate by watching
      // the count climb while they run from something.
      s.label = '+' + s.healed + ' HP';
      game.effects.burst(p.pos, 0x26c6da, 3, 2.5, 1.5, 0.25);
    },
    end: (game) => {
      game.effects.shockwave(game.player.pos, THEME.wind, 3.5, 0.35);
    },
}));

export const icon = [
  // A boot mid-stride, and the cross it is walking toward.
  '...............4444.....',
  '...............4444.....',
  '...............4444.....',
  '.............44444444...',
  '.............44444444...',
  '...............4444.....',
  '...............4444.....',
  '...............4444.....',
  '........................',
  '....000000..............',
  '...02222220.............',
  '...02222220.............',
  '...02222220.............',
  '...0222222220000000.....',
  '..0222222222222222220...',
  '..02222222222222222220..',
  '..02222222222222222220..',
  '..02222222222222222220..',
  '...000000003330000000...',
  '..........033330........',
  '..........033330........',
  '..........033330........',
  '..........003300........',
  '........................',
];
