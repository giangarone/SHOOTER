import { defineActiveItem } from '../shared.js';

export const id = 'itemRegen';

export default defineActiveItem(({ THREE, THEME, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'SUTURE ENGINE',
    charge: 30,
    theme: THEME.vitality,
    // TWENTY HEALTH THAT ARRIVES SLOWLY, against TRAUMA KIT's twenty-five that
    // arrives now - and TRAUMA KIT costs fifty where this costs thirty. That
    // is the whole comparison and it is a real one: this is cheaper, slower
    // and worse under pressure, so it is the item you press BEFORE the wave
    // rather than during it - and it heals through damage rather than being
    // erased by it, which nothing else in the pool does.
    effects: [['REGENERATE 2 HP/s', GOOD], ['FOR 10s', NOTE]],
    duration: 10,
    use: (game) => {
      game.effects.shockwave(game.player.pos, THEME.vitality, 6, 0.5);
      game.sfx.itemHeal2();
    },
    tick: (game, s, dt) => {
      heal(game.player, 2 * dt);
      // A drip rather than a stream: sixty motes a second is a fog, and this
      // has to still read as healing eight seconds later.
      s.drip = (s.drip || 0) - dt;
      if (s.drip > 0) return;
      s.drip = 0.32;
      game.effects.impact(game.player.eyeInto(_v), 0x8affc1, 4, 2, 2, 0.45);
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
  '........................',
  '.22...42...42...42...22.',
  '..42.4432.4432.4432.42..',
  '..43443334433344333442..',
  '.00333003330033300333000',
  '.00333003330033300333000',
  '.03223332233322333223200',
  '..22.2322.2322.2322.22..',
  '.22...22...22...22...22.',
  '........................',
  '........................',
  '............221.........',
  '............221.........',
  '............1121......1.',
  '..............121....211',
  '...............12222211.',
  '................111111..',
];
