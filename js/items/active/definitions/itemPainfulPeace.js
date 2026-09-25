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
  '........................',
  '........................',
  '...........43...........',
  '.........222222.........',
  '.......2442222222.......',
  '......224333333222......',
  '.....22333300333322.....',
  '.....23333000333321.....',
  '.....23303303303321.....',
  '.....23003303300321.....',
  '.....23303000303321.....',
  '.....23330000033311.....',
  '.....22333000333211.....',
  '.....22333303332211.....',
  '.....22233303332211.....',
  '......222222221111......',
  '........22221111........',
  '..........34..3.........',
  '..........33............',
  '..........3.............',
  '........................',
  '........................',
  '........................',
  '........................',
];
