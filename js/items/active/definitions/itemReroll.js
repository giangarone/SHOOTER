import { defineActiveItem } from '../shared.js';

export const id = 'itemReroll';

const ITEM_THEME = 0xe0e0e0;

export default defineActiveItem(({ THREE, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'SECOND OPINION',
    charge: 50,
    theme: ITEM_THEME,
    // THE ONLY ITEM IN THE POOL THAT DOES NOTHING IN A FIGHT, and it IS the
    // reroll rather than a token that buys one. It used to hand out two free
    // rerolls to be spent at a console afterwards, which made the press a
    // piece of bookkeeping: the player pressed the button, read a banner, and
    // then still had to walk to the console and do the thing. One press, one
    // new set of three, no second step.
    //
    // Free, and it does not touch the console's own ladder - see _itemReroll
    // in main.js. What the player is buying is the escalating price they are
    // not paying.
    //
    // A charge that is earned in the fight and spent in the shop is also the
    // one item whose timing is trivially correct, which is a fair trade for it
    // being useless the other ninety percent of the time.
    effects: [['REROLLS SHOP ON USE', GOOD], ['FREE OF CHARGE', NOTE]],
    // REFUSED WHERE THERE IS NOTHING TO REROLL - between waves the totems are
    // down, and a press that spent fifty enemies' worth of charge on an empty
    // room would be the worst failure in the pool. Same voice an uncharged
    // press gets, and the same voice the console gives for NOTHING TO REROLL.
    ready: (game) => game.totemArea.active && !game.totemArea.claimed,
    use: (game) => {
      game._itemReroll();
      game.effects.shockwave(game.player.pos, ITEM_THEME, 6, 0.5);
      game.ui.banner('REROLLED');
      game.sfx.reroll();
    },
}));

export const icon = [
  '........................',
  '........................',
  '...........42...........',
  '........44443442........',
  '.....4442222222342......',
  '....44322......2332.....',
  '....4332........222.....',
  '....4222..2221..........',
  '...422..22222221........',
  '...42...22200221...42...',
  '...42..2220000221..42...',
  '..442..2200000021..432..',
  '..232..2200000021..422..',
  '...42..1220000211..42...',
  '...22...22200221...42...',
  '........11222111..422...',
  '..........1111..4442....',
  '.....442........4332....',
  '.....2332......44322....',
  '......2234444442222.....',
  '........22232222........',
  '...........22...........',
  '........................',
  '........................',
];
