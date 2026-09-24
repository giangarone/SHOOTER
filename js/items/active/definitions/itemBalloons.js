import { defineActiveItem } from '../shared.js';

export const id = 'itemBalloons';

const ITEM_THEME = 0x26c6da;

export default defineActiveItem(({ THREE, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'PARTY BALLOONS',
    charge: 30,
    theme: ITEM_THEME,
    // FIVE BODIES TAKEN OUT OF THE FIGHT AND LEFT WHERE THEY CAN BE SHOT. It
    // is not a stun - CRYO PULSE is the stun, and a frozen enemy is still
    // standing in the crowd - it is REMOVAL: five things drift up out of the
    // scrum, stop being able to reach anything, and are still there to be
    // killed at leisure five seconds later.
    //
    // THE NEAREST FIVE, which is the same rule JACOB'S LADDER picks its chain
    // by and the same helper - so a player who has carried one already knows
    // what "five" means here, and it is always the five that are actually on
    // top of you.
    //
    // NOT BOSSES, and this one is a hard exemption rather than a resistance:
    // a boss is a fight with a floor pattern, and lifting it off the floor for
    // five seconds does not weaken it, it deletes the fight.
    effects: [['BALLOON THE 5 NEAREST', GOOD], ['ENEMIES FOR 5s', NOTE], ['NOT BOSSES', NOTE]],
    use: (game) => {
      let n = 0;
      for (const e of nearestEnemies(game, 5)) {
        if (!e.balloon(5)) continue;
        game.effects.burst(e.pos, 0x26c6da, 18, 4, 5, 0.8);
        n++;
      }
      game.effects.shockwave(game.player.pos, ITEM_THEME, 12, 0.6);
      if (!n) game.sfx.denied();
      else game.sfx.itemSurge();
    },
}));

export const icon = [
  '.........444442.........',
  '.........433332.........',
  '........44333332........',
  '........43333332........',
  '...4442.23333322.4442...',
  '..44332..433332..43332..',
  '.4433332.223222.4433332.',
  '.4333332...22...4333332.',
  '.4333332........4333332.',
  '.2333322...21...2333322.',
  '..23332....21....43322..',
  '...2222....21....2222...',
  '....2......21......2....',
  '....1111...21...1111....',
  '........11222111........',
  '..........2221..........',
  '.........222221.........',
  '........20022001........',
  '........20022001........',
  '........22022021........',
  '........12222211........',
  '.........122021.........',
  '..........22221.........',
  '..........11111.........',
];
