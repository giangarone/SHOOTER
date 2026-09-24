import { defineActiveItem } from '../shared.js';

export const id = 'itemParachute';

const ITEM_THEME = 0xffc400;

export default defineActiveItem(({ THREE, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'GOLDEN PARACHUTE',
    charge: 40,
    theme: ITEM_THEME,
    // FIVE THOUSAND DOLLARS TO NOT FIGHT THE WAVE. It is the most expensive
    // thing a player can buy with money - a box roll starts at a thousand -
    // and what it buys is the one thing money has never been able to buy in
    // this game, which is the fight itself not happening.
    //
    // NOTHING IT REMOVES PAYS OUT. The bodies are taken off the floor rather
    // than killed: no bounty, no orbs, no item charge, no drops. That is not a
    // meanness, it is the only thing standing between this and an infinite
    // money loop - a wave-twenty cast is worth more than five thousand
    // dollars, so a version that paid its own bodies out would refund the
    // price and then some, every time, forever.
    //
    // AND IT ENDS THE WAVE PROPERLY - an ORDINARY wave, which is the only
    // kind it will take (see the gate below). The queue is emptied along with
    // the floor, so _updateWave sees an empty room on the next frame and runs
    // the ordinary clear - the flawless streak, the resupply, the shop, all of it.
    // A player who takes no damage buying their way out has still cleared the
    // wave without being touched, which is the honest reading.
    effects: [['END THE WAVE NOW', GOOD], ['$5,000 PER PRESS', NOTE], ['NOT ON BOSS WAVES', NOTE]],
    // TWO REFUSALS, in one line and in the same voice an uncharged press gets.
    //
    // THE MONEY is PAY TO WIN's rule exactly: the second item in the pool
    // refused for want of a balance rather than a meter.
    //
    // AND NOT ON A BOSS WAVE. A boss wave does not end when the floor is clear
    // - it ends when the boss is dead, and the adds never stop - so there is
    // no room here to empty. Buying one out would mean killing the boss, which
    // is EXECUTIVE DECISION's whole job at three times the charge; letting the
    // cheaper item do it for money would retire the dearer one outright. The
    // boss is the one fight the run has to actually have.
    ready: (game) => game.credits >= PARACHUTE_COST && !game.bossFight,
    use: (game) => {
      game.credits -= PARACHUTE_COST;
      game._creditsDirty = true;
      const n = game._clearWaveNow();
      game.effects.shockwave(game.player.pos, ITEM_THEME, 30, 1.0);
      game.effects.addShake(0.35);
      game.ui.banner(n ? 'BOUGHT OUT' : 'NOTHING TO BUY');
      game.sfx.buy();
    },
}));

export const icon = [
  '........................',
  '........................',
  '.........222221.........',
  '......222222222221......',
  '.....22222111222221.....',
  '....2221111..1112221....',
  '...22211........12221...',
  '..22211..........12221..',
  '..2211............1221..',
  '..221..............221..',
  '.1121..............2111.',
  '...11..............11...',
  '........................',
  '.11....1........1....11.',
  '..11....1......1....11..',
  '....11..1......1..11....',
  '......11.1.42.1.11......',
  '........14443421........',
  '.........433332.........',
  '........44300332........',
  '........23300322........',
  '.........433332.........',
  '.........223222.........',
  '...........22...........',
];
