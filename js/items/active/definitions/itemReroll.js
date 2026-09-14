import { defineActiveItem } from '../shared.js';

export const id = 'itemReroll';

export default defineActiveItem(({ THREE, THEME, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'SECOND OPINION',
    charge: 50,
    theme: THEME.charge,
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
      game.effects.shockwave(game.player.pos, THEME.charge, 6, 0.5);
      game.ui.banner('REROLLED');
      game.sfx.reroll();
    },
}));
