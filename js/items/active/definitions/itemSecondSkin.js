import { defineActiveItem } from '../shared.js';

// ---- the shield ---------------------------------------------------------
export const id = 'itemSecondSkin';

const ITEM_THEME = 0x4ef3ff;

export default defineActiveItem(({ THREE, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'SECOND SKIN',
    charge: 50,
    theme: ITEM_THEME,
    // TWENTY POINTS OF SHIELD, AND NO CLOCK ON THEM. The shield PICKUP is
    // fifty for fifteen seconds - a window to push into - and this is the
    // opposite trade: less than half as much, kept until something takes it.
    // What the player is buying is not the size of it, it is that it is still
    // there in two minutes.
    //
    // TWENTY IS LESS THAN TRAUMA KIT'S TWENTY-FIVE AND COSTS THE SAME FIFTY,
    // which looks wrong and is not: a shield point is better than a health
    // point, because takeDamage spends the shield FIRST and fully - a hit that
    // breaks it does not carry the remainder through - so twenty of these eats
    // one arbitrarily large hit as well as twenty small ones.
    //
    // IT CANCELS THE PICKUP'S CLOCK RATHER THAN INHERITING IT. Adding to a
    // shield that was already counting down would make the item's twenty
    // expire on somebody else's timer, which is the one behaviour a player
    // could not predict; taking the clock off is the reading that is always
    // in the player's favour and is always the same.
    effects: [['+20 SHIELD', GOOD], ['NEVER EXPIRES', GOOD]],
    use: (game) => {
      const p = game.player;
      p.shield += 20;
      p.shieldEnd = 0;
      game.effects.shockwave(p.pos, ITEM_THEME, 7, 0.6);
      game.effects.burst(p.eyeInto(_v), 0x4ef3ff, 26, 5, 3, 0.7);
      game.sfx.pickupShield();
    },
}));

// THE LAYER THAT STAYS. Plate, seam, socket - and the halo ticks floating
// just off the surface, because the point of the thing is the second skin,
// not the first.
export const icon = [
  '........................',
  '........................',
  '........................',
  '........................',
  '.........4.....3........',
  '.........422221.........',
  '.......4222222221.......',
  '......422222222221......',
  '......422111111221......',
  '....3.421222222211.3....',
  '......421223322211......',
  '......421224322211......',
  '...4..421222222211..4...',
  '......422222222221......',
  '.......2221111221.......',
  '........22222221........',
  '.........222221.........',
  '..........2221..........',
  '...........11...........',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
];
