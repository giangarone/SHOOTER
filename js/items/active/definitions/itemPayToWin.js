import { defineActiveItem } from '../shared.js';

export const id = 'itemPayToWin';

export default defineActiveItem(({ THREE, THEME, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'PAY TO WIN',
    charge: 0,
    theme: THEME.payToWin,
    // THE ONLY ITEM IN THE GAME THAT IS NOT PAID FOR IN ENEMIES. Its meter is
    // never drawn, because there is nothing to draw - the cost is a thousand
    // dollars, every press, and the credits readout in the top corner is the
    // charge bar. See UI.setItem, which hides the meter for any zero-charge
    // item rather than for this one by name.
    //
    // THE EXPLOIT IS THE FEATURE, AND IT IS BOUNDED. A player standing on a
    // pile of credits can press this until the pile is gone - that is the
    // whole joke, and it is safe because the pile is finite and because every
    // thousand spent here is a reroll, an ammo refill or a box roll that does
    // not happen. What it cannot become is free: there is no way to earn money
    // without killing, so pressing it is always spending a wave's takings.
    //
    // TWICE THE BASE SHOT, TO EVERYTHING. Read through getEffectiveDamage like
    // every other item's payload, so it scales with the build rather than
    // being a flat number that is enormous on wave three and nothing on wave
    // thirty. Against a crowd that is real money well spent; against one boss
    // it is two shots for a thousand dollars, which is the bad buy the name
    // promises.
    effects: [['$1,000 PER PRESS', NOTE], ['2x DAMAGE TO ALL ENEMIES', GOOD]],
    // The one item refused for want of MONEY rather than charge. Same voice an
    // uncharged press gets, because it is the same message - not now.
    ready: (game) => game.credits >= PAY_TO_WIN_COST,
    use: (game) => {
      const p = game.player;
      game.credits -= PAY_TO_WIN_COST;
      const dmg = p.getEffectiveDamage(p.weapon.damage) * 2;
      // A copy of the list, because hurtEnemy can kill and the sweep that
      // compacts `enemies` runs later in the frame - but a splitter's children
      // are pushed onto it the moment the parent dies, and paying the bonus to
      // something that was not on the floor when the button was pressed is the
      // one way this could hit the same enemy twice.
      const list = game.enemies.slice();
      for (const e of list) {
        if (!e.dead) game.hurtEnemy(e, dmg);
      }
      game.effects.shockwave(p.pos, THEME.payToWin, 30, 0.9);
      game.ui.banner('PAID');
      game.sfx.buy();
    },
}));
