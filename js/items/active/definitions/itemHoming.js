import { defineActiveItem } from '../shared.js';

export const id = 'itemHoming';

const ITEM_THEME = 0xff5fd2;

export default defineActiveItem(({ THREE, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'BIRD DOG',
    charge: 40,
    theme: ITEM_THEME,
    // SEEKER, ON A CLOCK. It reads the same _homeShot path the passive item
    // does - the same cone, the same line-of-sight check, the same bent tracer
    // - so a player who has carried Seeker already knows exactly what this
    // does, and a player who has not gets shown the mechanic for ten seconds.
    //
    // It does not stack with the passive item and it does not need to: the
    // shot path takes the wider of the two cones, so owning Seeker makes this
    // item a dead press rather than a double one, which is the honest
    // behaviour.
    effects: [['SHOTS HOME IN ON', GOOD], ['TARGETS FOR 10s', NOTE]],
    duration: 10,
    use: (game) => {
      game.player.itemHoming = 1;
      game.effects.shockwave(game.player.pos, ITEM_THEME, 6, 0.5);
      game.sfx.itemSurge();
    },
    end: (game) => { game.player.itemHoming = 0; },
}));

export const icon = [
  '........................',
  '................1.......',
  '.............2222221....',
  '............211111121...',
  '...........211.....121..',
  '..........211.......121.',
  '..........21...442...21.',
  '..........21..44332..21.',
  '.........121..43332..211',
  '..........21..23322..21.',
  '..........21...222...21.',
  '..........12442.....211.',
  '...........4332....211..',
  '..........44332222211...',
  '..........4321111111....',
  '.........4422...1.......',
  '........4422............',
  '.......4422.............',
  '.....44422..............',
  '...444322...............',
  '.4443222................',
  '443222..................',
  '2222....................',
  '........................',
];
