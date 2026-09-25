import { defineActiveItem } from '../shared.js';

export const id = 'itemPickpocket';

const ITEM_THEME = 0xffb300;

export default defineActiveItem(({ THREE, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'PICKPOCKET',
    charge: 20,
    theme: ITEM_THEME,
    // FAITH HEALING'S POORER COUSIN, AND IT ASKS NOTHING ABOUT DISTANCE. One
    // health and five rounds per body ANYWHERE on the floor, which makes it
    // the item for the wave that has already spread out - the moment the ten
    // metre version pays nothing.
    //
    // THE AMMUNITION IS THE REAL PAYLOAD. A point a body is a trickle; five
    // rounds a body against a full wave is more than an ammo crate, and there
    // is otherwise no way at all to buy rounds in the middle of a fight except
    // OPEN VEIN, which costs fifty health to do it.
    effects: [['PER LIVING ENEMY:', NOTE], ['HEAL 1, GAIN 5 AMMO', GOOD]],
    use: (game) => {
      const p = game.player;
      let n = 0;
      for (const e of game.enemies) if (!e.dead) n++;
      if (!n) {
        game.sfx.denied();
        game.effects.shockwave(p.pos, ITEM_THEME, 3, 0.3);
        return;
      }
      p.heal(n);
      p.reserveAmmo = Math.min(p.maxReserve, p.reserveAmmo + n * 5);
      game.ui.flashReserve();
      game.effects.shockwave(p.pos, ITEM_THEME, 8, 0.6);
      game.effects.burst(p.eyeInto(_v), 0xffb300, 24, 5, 3, 0.6);
      game.sfx.itemAmmo();
    },
}));

export const icon = [
  '........................',
  '........................',
  '...............43.......',
  '........444444..........',
  '........44442442........',
  '........43342402........',
  '.....22444442242222.....',
  '....2442222222222221....',
  '....2222333333222221....',
  '....2022222222222021....',
  '....2022222332222021....',
  '....2022222332222021....',
  '....2022244334422021....',
  '....2022222222222021....',
  '....2022222222222021....',
  '....2222222222222221....',
  '....1111111111111111....',
  '...........11...........',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
];
