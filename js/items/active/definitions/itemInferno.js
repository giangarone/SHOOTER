import { defineActiveItem } from '../shared.js';

export const id = 'itemInferno';

const ITEM_THEME = 0xff5a00;

export default defineActiveItem(({ THREE, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'BRIMSTONE',
    charge: 40,
    theme: ITEM_THEME,
    // A FIXED RATE, not the player's own burn. Incendiary may not be owned -
    // most runs it is not - and an item that did nothing at all until you
    // happened to draft an unrelated passive item would be the only item in
    // the pool whose text is a lie on the card it is read from.
    //
    // Three seconds is short and the rate is high, which is the shape fire has
    // everywhere else in this game (see status.js): it is a reason to press
    // the advantage now rather than a clock to wait out.
    //
    // THE FIXED FIRE BASE PER TICK, at two ticks a beat, on every enemy at
    // once. Weapon damage upgrades do not change it, and the active item does
    // not carry a hidden multiplier of its own.
    effects: [['BURN ALL ENEMIES', GOOD], ['10 DAMAGE PER TICK, 3s', NOTE]],
    use: (game) => {
      let n = 0;
      const burn = game.player.fireTickDamage;
      for (const e of game.enemies) {
        if (e.dead) continue;
        e.applyStatus('burn', 3, burn);
        // Lit one at a time from the player outward would be the nicer
        // animation and the wrong read: the item is ONE event, and thirty
        // little fires starting on the same frame is what says so.
        game.effects.impact(e.pos, 0xff7a18, 6, 3, 2.5, 0.5);
        n++;
      }
      game.effects.shockwave(game.player.pos, ITEM_THEME, 30, 0.9);
      if (n) game.effects.addShake(0.2);
      game.sfx.itemBlast();
    },
}));

export const icon = [
  '........................',
  '...........42...........',
  '..........4432..........',
  '.........443332.........',
  '.........4333332........',
  '........44333322........',
  '........4333332.........',
  '.......443333332........',
  '......44333333332.......',
  '......433333333332......',
  '.....2433333333332......',
  '......2233333332222.....',
  '........43333332........',
  '........23333322........',
  '....1....432232....1....',
  '..22221..222221..22221..',
  '.2222221.222221.2222221.',
  '.2002002200220022002001.',
  '.2002001120220112002001.',
  '.1222211.222221.1222211.',
  '..12021..112011..12021..',
  '...2221....221....2221..',
  '...1111....111....1111..',
  '........................',
];
