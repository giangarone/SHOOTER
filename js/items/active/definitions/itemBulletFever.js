import { defineActiveItem } from '../shared.js';

export const id = 'itemBulletFever';

export default defineActiveItem(({ THREE, THEME, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, Snowman, SNOWMAN_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'BULLET FEVER',
    charge: 10,
    theme: THEME.brass,
    // THE PAWN SHOP OF THE AMMO FAMILY. OPEN VEIN sells the whole reserve on
    // the big occasion; this trades sixty rounds for thirty health whenever
    // the shelf is full and the bar is thin - the everyday conversion, not
    // the grand gesture. Charge ten because the limit should be what is in
    // the bag, not the clock: a player who keeps pressing it is telling you
    // they have ammunition they would rather be carrying as blood.
    //
    // THE ROUNDS COME OFF THE RESERVE ONLY. The magazine stays in the gun,
    // so the conversion never interrupts the firing itself - this is not a
    // reload, it is a sale, and the gun is not part of what is being sold.
    //
    // REFUSED UNDER SIXTY, on LANCE's rule: a press that spent the charge
    // and minted nothing would be the worst failure in the pool, and the
    // denial noise is the one the player already knows.
    effects: [['60 RESERVE AMMO', NOTE], ['CONVERTED INTO 30 HP', GOOD]],
    ready: (game) => game.player.reserveAmmo >= 60,
    use: (game) => {
      const p = game.player;
      p.reserveAmmo -= 60;
      p.heal(30);
      // The reserve number HAS to move in the player's eye, visibly - it is
      // where they read the ammunition, and sixty rounds vanishing with no
      // flash is a theft, not a sale.
      game.ui.flashReserve();
      game.effects.burst(p.eyeInto(_v), 0x8affc1, 22, 5, 3, 0.6);
      game.effects.shockwave(p.pos, THEME.brass, 5, 0.5);
      game.sfx.itemHeal2();
    },
}));

export const icon = [
  // A cartridge beside the cross it is about to become.
  '........................',
  '.........00.............',
  '........0330............',
  '.......033330...........',
  '.......033330...........',
  '.......033330...........',
  '......00333300..........',
  '......03333330..4444....',
  '......03333330.444444...',
  '......03333330.444444...',
  '......03222230..4444....',
  '......03222230..4444....',
  '......02222200..........',
  '......03333330..........',
  '......03333330..........',
  '......03333330..........',
  '......02222220..........',
  '.......0000000..........',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
];
