import { defineActiveItem } from '../shared.js';

export const id = 'itemPinata';

export default defineActiveItem(({ THREE, THEME, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'PINATA',
    charge: 40,
    theme: THEME.salvage,
    // FIVE GUARANTEED DROPS, PAID OUT BY KILLING. Every other item in the pool
    // resolves the moment it is pressed or inside a window with a clock on it;
    // this one sits on the run until the player has earned it out, which makes
    // it the only item that cannot be pressed at the wrong time - it can only
    // be pressed too early to matter.
    //
    // IT ROLLS THE ORDINARY TABLE, not a table of its own. What is guaranteed
    // is that SOMETHING drops, not what: the need terms still apply, so a
    // starving player's five are mostly ammunition and a comfortable one's are
    // mostly buffs, exactly as an ordinary kill's would be. An item with its
    // own loot table would be a second economy with one caller.
    //
    // NOT ON BOSS PARTS, on the same terms the kill sweep already holds: a
    // boss pays out by bleeding at health thresholds, and letting the counter
    // spend itself on the one body that is already a payout would be five
    // drops the player never sees.
    effects: [['NEXT 5 KILLS', NOTE], ['ALWAYS DROP LOOT', GOOD]],
    use: (game) => {
      game.player.pinataLeft = 5;
      game.effects.shockwave(game.player.pos, THEME.salvage, 7, 0.6);
      game.effects.burst(game.player.eyeInto(_v), 0xc6ff00, 26, 6, 3, 0.7);
      game.ui.banner('PINATA x5');
      game.sfx.itemSurge();
    },
}));
