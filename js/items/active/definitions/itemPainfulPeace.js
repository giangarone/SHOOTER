import { defineActiveItem } from '../shared.js';

export const id = 'itemPainfulPeace';

const ITEM_THEME = 0xfff2b0;

export default defineActiveItem(({ THREE, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, Snowman, SNOWMAN_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'PAINFUL PEACE',
    charge: 0,
    theme: ITEM_THEME,
    // AEGIS'S WINDOW, SOLD BY THE SECOND. Two seconds of the same
    // invulnEnd the sixty-point item opens for eight, bought with five
    // health through pay() - the price cannot be dodged, shielded or
    // healed-back-and-charged-again, and the floor of one means the press
    // itself is never the thing that kills you. It is the honest panic
    // button: cheap enough to be pushed on reflex, priced so the reflex
    // hurts.
    //
    // THE VIGNETTE IS FREE. main.js drives its invulnerability frame off
    // invulnEnd rather than off any item by name (AEGIS's comment, made
    // policy), so two seconds of this reads exactly as loud as the long
    // version - which matters more here, because a button bought on HP and
    // fired in a crowd must be VISIBLY on, or the player keeps running
    // scared through a peace they already paid for.
    //
    // REFUSED AT FIVE OR LESS, on MACHINE FEAST's rule: pay() would floor
    // the bar at one and quietly charge less than the card says, so the
    // gate is what keeps every press worth exactly five.
    effects: [['TAKE 5 HP DAMAGE', NOTE], ['INVINCIBLE FOR 2s', GOOD]],
    ready: (game) => game.player.health > 5,
    use: (game) => {
      const p = game.player;
      pay(p, 5);
      p.invulnEnd = Math.max(p.invulnEnd, game.time + 2);
      game.effects.shockwave(p.pos, ITEM_THEME, 6, 0.55);
      game.effects.burst(p.eyeInto(_v), 0xfff2b0, 18, 5, 3, 0.5);
      game.ui.damage();
      game.sfx.pickupShield();
    },
}));

export const icon = [
  // The CND peace sign, picked out in the holy pale: a circle and three bars.
  '........................',
  '........000000000.......',
  '......0033333333300.....',
  '.....0333333333333330...',
  '....03333330333333330...',
  '...0333333303333333330..',
  '...0333333033333333330..',
  '..033333333033333333330.',
  '..033333333033333333330.',
  '..033333333333333333330.',
  '..033333333033333333330.',
  '..033333333033333333330.',
  '..033333330333033333330.',
  '..033333303330333333330.',
  '..033333033300333333330.',
  '..033330333003333333330.',
  '..0333303330.0333333330.',
  '...03330330...303333330.',
  '...03300330...330333330.',
  '....033033.....0333330..',
  '.....003........3300....',
  '......0033333333300.....',
  '........000000000.......',
  '........................',
];
