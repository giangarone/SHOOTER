import { defineActiveItem } from '../shared.js';

export const id = 'itemLance';

export default defineActiveItem(({ THREE, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'LANCE',
    charge: 20,
    theme: 0x76ff03,
    // THIRTY ROUNDS AT ONCE, AS ONE ROUND. It is the magazine spent in a
    // straight line, which is why it costs the ammunition rather than being
    // free: the item is not extra damage, it is the SHAPE of damage the pulse
    // rifle cannot make - everything standing between you and the wall, in one
    // frame, through cover the pierce passive item would have stopped at.
    //
    // IT REFUSES WHEN THE ROUNDS ARE NOT THERE, out loud. A press that spent
    // the charge and fired nothing would be the worst failure in the pool, and
    // the denial noise is one the player has already learnt from pressing an
    // uncharged item.
    effects: [['ONE MASSIVE SHOT', GOOD], ['30x DMG, 30 AMMO', NOTE]],
    ready: (game) => game.player.mag + game.player.reserveAmmo >= 30,
    use: (game) => {
      const p = game.player;
      // Out of the magazine first and the reserve second, which is the order
      // every other round in the game is spent in.
      let owed = 30;
      const fromMag = Math.min(p.mag, owed);
      p.mag -= fromMag;
      owed -= fromMag;
      p.reserveAmmo = Math.max(0, p.reserveAmmo - owed);
      game.megaShot(30);
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
  '...220222221............',
  '...22022222221..........',
  '...220222222221.........',
  '...2202222222221........',
  '.4422022222222221.444442',
  '.4322022222222211.433332',
  '.222202222222211..222222',
  '...220222222211.........',
  '...22022222111..........',
  '...220222221............',
  '...110111111............',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
];
