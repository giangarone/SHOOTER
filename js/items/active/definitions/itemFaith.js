import { defineActiveItem } from '../shared.js';

// ---- the room's own count as the payload --------------------------------
export const id = 'itemFaith';

const ITEM_THEME = 0xfff2b0;

export default defineActiveItem(({ THREE, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'FAITH HEALING',
    charge: 40,
    theme: ITEM_THEME,
    // HEALED BY THE THING THAT IS TRYING TO KILL YOU, and the closer it is the
    // more it is worth. Two health per body inside ten metres is nothing at
    // all across an empty room and forty in the middle of a wave-twenty crowd,
    // which makes it the only heal in the pool that is best pressed at the
    // WORST moment - surrounded, and about to be hit.
    //
    // TEN METRES IS THE RANGE THE PLAYER CAN SEE, not a number they can count:
    // it is TECTONIC's nine plus a step, so a player who owns both learns one
    // distance. Nothing is consumed - the enemies are not harmed and not
    // moved - which is what keeps this a heal rather than a crowd answer.
    effects: [['HEAL 2 HP PER ENEMY', GOOD], ['WITHIN 10m', NOTE]],
    use: (game) => {
      const p = game.player;
      let n = 0;
      for (const e of game.enemies) {
        if (e.dead) continue;
        if (e.pos.distanceTo(p.pos) > 10) continue;
        n++;
        // A thread from each body to the player, so what paid for the heal is
        // legible as a COUNT rather than as a number on the health bar.
        game.effects.beam(e.pos.clone().setY(1.0), p.eyeInto(_v).clone(), 0xfff2b0);
      }
      if (!n) {
        // The same voice WATERLINE gives a press that could not do anything.
        game.sfx.denied();
        game.effects.shockwave(p.pos, ITEM_THEME, 3, 0.3);
        return;
      }
      p.heal(2 * n);
      game.effects.shockwave(p.pos, ITEM_THEME, 10, 0.7);
      game.effects.burst(p.eyeInto(_v), 0xfff2b0, 24, 5, 3, 0.7);
      game.sfx.itemHeal2();
    },
}));

export const icon = [
  '........................',
  '.......4222222242.......',
  '......422......232......',
  '.....442........432.....',
  '.....2232......4222.....',
  '.......2222222222.......',
  '........................',
  '..........2221..........',
  '.........222221.........',
  '.........222221.........',
  '2221.....222221.....2221',
  '1222221..122211..2222211',
  '.11122221.2221.22221111.',
  '....1122222222222111....',
  '......111222221111......',
  '.........122221.........',
  '..........22221.........',
  '..........22221.........',
  '..........22221.........',
  '..........22221.........',
  '..........22221.........',
  '..........22221.........',
  '..........22221.........',
  '..........11111.........',
];
