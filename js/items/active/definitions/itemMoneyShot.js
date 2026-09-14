import { defineActiveItem } from '../shared.js';

export const id = 'itemMoneyShot';

export default defineActiveItem(({ THREE, THEME, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'MONEY SHOT',
    charge: 40,
    theme: THEME.gold,
    // THE WHOLE BALANCE, AS DAMAGE, TO EVERYTHING. PAY TO WIN spends a
    // thousand at a time for two shots' worth of damage and is deliberately a
    // bad buy; this spends every dollar the player has for exactly that many
    // points, which is a terrible rate early and an absurd one on a run that
    // has been hoarding.
    //
    // IT IS THE ANSWER TO A FULL WALLET AND NOTHING ELSE. A player who spends
    // their money in the shop - which is what money is for - presses this for
    // almost nothing, and that is correct: what it converts is the money that
    // was not doing anything, and the decision it creates is whether to keep
    // eight thousand dollars for a box roll or spend it on the wave that is
    // currently killing you.
    //
    // A FLAT NUMBER, DELIBERATELY NOT SCALED BY THE GUN. The card promises a
    // balance and a balance is a number the player can read off the corner of
    // the screen; multiplying it by the build would make the one item in the
    // pool with a checkable promise the one item whose promise is wrong.
    effects: [['SPEND ALL YOUR CREDITS', NOTE], ['AS DAMAGE TO EVERY ENEMY', GOOD]],
    use: (game) => {
      const p = game.player;
      const spent = Math.floor(game.credits);
      if (spent <= 0) {
        game.sfx.denied();
        game.effects.shockwave(p.pos, THEME.gold, 3, 0.3);
        return;
      }
      game.credits -= spent;
      game._creditsDirty = true;
      for (const e of game.enemies.slice()) {
        if (e.dead) continue;
        game.effects.impact(e.pos, 0xf9a825, 10, 5, 3, 0.4);
        game.hurtEnemy(e, spent);
      }
      game.effects.shockwave(p.pos, THEME.gold, 30, 0.9);
      game.effects.addShake(0.45);
      game.ui.banner('SPENT $' + spent.toLocaleString());
      game.sfx.credits();
      game.sfx.itemBlast();
    },
}));
