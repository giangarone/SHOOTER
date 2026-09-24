import { defineActiveItem } from '../shared.js';

export const id = 'itemFrenzy';

const ITEM_THEME = 0x8b0000;

export default defineActiveItem(({ THREE, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'RED MIST',
    charge: 40,
    theme: ITEM_THEME,
    // THE DRAWBACK IS THE FEATURE. Three times damage for five seconds is the
    // hardest hit in the pool, and taking double while it runs is what stops
    // it being a strictly-better OVERDRIVE - it is pressed when the room is
    // already nearly clear, or it is pressed once.
    //
    // Both halves are the ITEM's multipliers rather than the shared ones, so a
    // rage pickup and this one stack instead of overwriting each other, and a
    // Blood Pact's damageTakenMult is not silently replaced by the two.
    effects: [['3x DAMAGE FOR 10s', GOOD], ['YOU TAKE 2x DAMAGE', NOTE]],
    duration: 10,
    use: (game) => {
      const p = game.player;
      p.itemDamageMult = 3;
      p.itemTakenMult = 2;
      game.effects.shockwave(p.pos, ITEM_THEME, 7, 0.6);
      game.effects.burst(p.eyeInto(_v), 0x8b0000, 26, 6, 3, 0.7);
      game.sfx.itemFrenzy();
    },
    end: (game) => {
      game.player.itemDamageMult = 1;
      game.player.itemTakenMult = 1;
      game.effects.shockwave(game.player.pos, ITEM_THEME, 4, 0.35);
    },
}));

export const icon = [
  '........................',
  '........................',
  '.442....................',
  '.432................42..',
  '.222.....222221.....22..',
  '.......2222222221...2...',
  '.....22222222222221.....',
  '....2222222222222221....',
  '....2233033033033221....',
  '...222330330330332221...',
  '...222330330330330221...',
  '..22220000000000002221..',
  '..22200000000000000221..',
  '..12200000000000000211..',
  '...222000000000000221...',
  '...122330330330330211...',
  '....2233033033033221....',
  '....1233033033033211....',
  '.....11222222222111.442.',
  '.......1122222111...232.',
  '.........111111......22.',
  '........................',
  '........................',
  '........................',
];
