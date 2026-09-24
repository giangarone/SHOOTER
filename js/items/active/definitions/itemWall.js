import { defineActiveItem } from '../shared.js';

export const id = 'itemWall';

export default defineActiveItem(({ THREE, THEME, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'FIREBREAK',
    charge: 12,
    theme: THEME.hellfire,
    // A LINE, WHERE EVERYTHING ELSE IS A CIRCLE. The answer to every radial
    // effect in this game is the same - back off - and the one item that asks
    // a different question is the one that says "not through here". Laid
    // ACROSS the player's facing, so it goes up between them and whatever they
    // are looking at, which is the only orientation anybody ever wants.
    //
    // IT STOPS ENEMY ROUNDS, which is the half that makes it a wall rather
    // than a long thin lava patch, and the half a player discovers by standing
    // behind one during a shooter volley.
    effects: [['RAISE A FIRE WALL', GOOD], ['BLOCKS SHOTS AND BURNS', GOOD]],
    use: (game) => {
      const p = game.player;
      facing(game);
      // Four and a half metres out. Close enough that it is unambiguously the
      // player's wall and far enough that they are not standing in it - at
      // three the flames sat on the camera and the arena behind them was gone.
      const x = Math.max(-BOUND + 5, Math.min(BOUND - 5, p.pos.x + _dir.x * 4.5));
      const z = Math.max(-BOUND + 5, Math.min(BOUND - 5, p.pos.z + _dir.z * 4.5));
      game.deploy(new FireWall(
        game, x, z, _dir.x, _dir.z, game.player.fireTickDamage * 1.5
      ));
      game.effects.shockwave(_v.set(x, 0, z), THEME.hellfire, 5, 0.5);
      game.sfx.itemDeploy();
    },
}));

export const icon = [
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '...........42...........',
  '..........4432..........',
  '..........4332..........',
  '.........443332...42.111',
  '....42...433332..4432111',
  '...4432..433332..4332...',
  '...4332.4433322..43322..',
  '...43334433332..44332...',
  '..443333333332..43332.11',
  '..4333333333334443332.11',
  '.443333333333333333332..',
  '.4333333333333333333332.',
  '243333333333333333333322',
  '.2333333333333333333322.',
  '..43333333333333333332..',
  '.22333322333333223333221',
  '.11111111122221111111111',
  '........................',
  '........................',
];
