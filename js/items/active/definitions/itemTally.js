import { defineActiveItem } from '../shared.js';

export const id = 'itemTally';

export default defineActiveItem(({ THREE, THEME, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'BODY COUNT',
    charge: 32,
    theme: THEME.carnage,
    // AN EMPTY BUTTON THAT THE PLAYER FILLS. Pressed into an empty room it
    // does literally nothing, and pressed into a crowd it is the biggest
    // damage number in the game - which makes it the only item in the pool
    // whose value is decided entirely by WHEN, and that is worth thirty-two
    // seconds on its own.
    //
    // THE WINDOW DOES NOT EXTEND ON A KILL. It was the obvious thing to add
    // and it is wrong: a stacking buff that refreshes itself off its own
    // output does not end, it just gets bigger until the wave does, and then
    // the item has no shape at all. Eight seconds, from the press.
    effects: [['+10% DAMAGE PER KILL', GOOD], ['FOR 8s, MAX 20 KILLS', NOTE]],
    duration: 8,
    use: (game, s) => {
      s.stacks = 0;
      game.player.itemDamageMult = 1;
      game.effects.shockwave(game.player.pos, THEME.carnage, 6, 0.5);
      game.sfx.itemSurge();
    },
    onKill: (game, s) => {
      // Twenty is 3x, which is where every other damage window in the pool
      // tops out. Uncapped, a boss wave's adds would put this an order of
      // magnitude past anything else in the game.
      if (s.stacks >= 20) return;
      s.stacks++;
      game.player.itemDamageMult = 1 + 0.1 * s.stacks;
      s.label = String(s.stacks);
      game.effects.impact(game.player.eyeInto(_v), 0xff1744, 5, 3, 2, 0.25);
    },
    end: (game) => { game.player.itemDamageMult = 1; },
}));

export const icon = [
  '........................',
  '....................42..',
  '...................4432.',
  '..................44322.',
  '...221..221.221..44322..',
  '...221..221.221.44322...',
  '...221..221.22244332....',
  '...221..221.22333321....',
  '...221..221.23322221....',
  '...221..221.4322.221....',
  '...221..2224432..221....',
  '...221..2333331..221....',
  '...221..4333321..221....',
  '...221.44322221..221....',
  '...22244332.221..221....',
  '...22333331.221..221....',
  '...23333321.221..221....',
  '...43322221.221..221....',
  '..44322.221.221..221....',
  '.44331..221.221..221....',
  '442211..111.111..111....',
  '222.....................',
  '.2......................',
  '........................',
];
