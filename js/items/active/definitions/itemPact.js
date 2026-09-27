import { defineActiveItem } from '../shared.js';

export const id = 'itemPact';

const ITEM_THEME = 0xb71c1c;

export default defineActiveItem(({ THREE, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'BLOOD PRICE',
    charge: 30,
    theme: ITEM_THEME,
    // PAID UP FRONT, IN THE ONE CURRENCY THE PLAYER CANNOT FARM. It is the
    // same trade RED MIST offers with the terms reversed: that one is cheap
    // now and dangerous for five seconds, this one is expensive now and free
    // for ten. A player at full health should find this the easier press, and
    // a player at thirty should find it a real question.
    effects: [['3x DAMAGE FOR 10s', GOOD], ['COSTS 25 HP', NOTE]],
    duration: 10,
    use: (game) => {
      const p = game.player;
      pay(p, 25);
      p.itemDamageMult = 3;
      game.ui.damage();
      game.effects.shockwave(p.pos, ITEM_THEME, 7, 0.6);
      game.effects.burst(p.eyeInto(_v), 0xb71c1c, 30, 6, 3, 0.8);
      game.sfx.itemPact();
    },
    end: (game) => { game.player.itemDamageMult = 1; },
}));

// THE SCALE YOU PAY ON. Blood in one pan, hot brass in the other, and the
// beam not quite level - twenty-five of the bar against ten seconds of
// treble.
export const icon = [
  '........................',
  '........................',
  '...........43...........',
  '...........21...........',
  '....4222222222222221....',
  '.....1..1..21...1..1....',
  '......4....21....43.....',
  '.....433...21....33.....',
  '...2222221.21.2222221...',
  '....11111..21..11111....',
  '...........21...........',
  '...........21...........',
  '...........21...........',
  '...........21...........',
  '...........21...........',
  '...........21...........',
  '...........21...........',
  '...........21...........',
  '........22222221........',
  '.......1111111111.......',
  '........................',
  '........................',
  '........................',
  '........................',
];
