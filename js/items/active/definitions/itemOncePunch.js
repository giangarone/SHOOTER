import { defineActiveItem } from '../shared.js';

export const id = 'itemOncePunch';

const ITEM_THEME = 0x97233f;

export default defineActiveItem(({ THREE, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, Snowman, SNOWMAN_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'ONCE-PUNCH POLICY',
    charge: 40,
    theme: ITEM_THEME,
    // THE MELEE SWING, ONCE, WITH NO CEILING ON IT. The next swing that
    // CONNECTS kills whatever it connects with - a chaser, yes, but the card
    // is written about the other end of the ladder: a Colossus, a boss, the
    // thing the arena sends when the roster has nothing worse. The work is
    // done in Game._meleeStrike on _throatCut's exact route (hp to zero,
    // `dead` raised, the sweep books the bounty), because takeDamage's whole
    // pile of correct refusals - wards, plating, closed shells - is tuned
    // for BULLETS, and a card that says "kills" cannot have an armour value.
    //
    // IT KEEPS UNTIL IT LANDS. Same contract HAEMOPHAGE keeps, for the same
    // reason: forty points of charge is a real price, and a window that
    // expired with the swing unswung would be the item silently taking back
    // what it granted. A swing at fresh air spends nothing - the card says
    // the next melee HIT, and the game calls a miss a miss everywhere else
    // already. No duration means it never joins the running list, so there
    // is no chip to outlive the policy and no end() to forget: reset()
    // carries it back to zero with the rest of the run.
    //
    // WHY IT IS NOT EXECUTIVE DECISION AT A THIRD OF THE PRICE: the boss has
    // to be TOUCHED. Melee range of a boss is the most expensive real
    // estate in the arena, and the walk is the rest of the charge.
    effects: [['NEXT MELEE HIT KILLS', GOOD], ['ANY ENEMY - BOSSES TOO', GOOD], ['KEEPS UNTIL IT LANDS', NOTE]],
    use: (game) => {
      game.player.meleeExecute = 1;
      game.effects.shockwave(game.player.pos, ITEM_THEME, 7, 0.6);
      game.effects.burst(game.player.eyeInto(_v), 0x97233f, 20, 5, 3, 0.55);
      game.sfx.itemRites();
    },
}));

export const icon = [
  '........................',
  '........................',
  '........................',
  '...0000..0000..0000.0...',
  '..022222022222022222020.',
  '..023332023332023332020.',
  '..02333202333202333220..',
  '.02222202222202222220...',
  '.02333202333202333220...',
  '.02333333333333333220...',
  '.02333333333333333220...',
  '.02333333333333333220...',
  '.02203333333333332220...',
  '.0220233333333332220....',
  '0233023333333333220.....',
  '023002333333333220......',
  '022002333333332220......',
  '.020.023333333220.......',
  '.....02222222220........',
  '....022222222220........',
  '.....0000000000.........',
  '........................',
  '........................',
  '........................',
];
