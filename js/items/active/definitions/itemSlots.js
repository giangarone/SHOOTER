import { defineActiveItem } from '../shared.js';

export const id = 'itemSlots';

const ITEM_THEME = 0xff5252;

// What one press costs. Flat, on PAY TO WIN's rule: it is pressed in a row
// or not at all, and a price that climbed would turn the joke into a sum.
// Two hundred and fifty - enough that a string of busts is a felt decision
// against an ammo refill, small enough that a wave's takings still buys a
// handful of them.
const SPIN_COST = 250;
// The three pockets of the wheel, in the order the banner names them.
const SPIN_TIME = 0.9;

export default defineActiveItem(({ THREE, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, Snowman, SNOWMAN_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'SLOT MACHINE',
    charge: 0,
    theme: ITEM_THEME,
    // THE CHEAPEST GAMBLE IN THE POOL, AND THE ONLY ONE PRICED IN MONEY. SIX
    // CHAMBERS plays with the health bar; this plays with the wallet, priced
    // squarely between an ammo refill and a box roll. Two pockets pay about
    // what the shelf would charge for them; the third is the house, and at
    // $250 a bust is one you feel - which is what makes it a slot machine
    // and not a discount.
    //
    // THE SPIN IS NINETY ROUNDS SHORT OF A SECOND, on SIX CHAMBERS' rule:
    // the click track IS the item, the outcome is rolled at the press, and
    // the wheel stopping is what the player is watching. A number changing
    // the frame the button drops would be a worse trade with extra steps.
    // Like SIX CHAMBERS the roll is taken NOW and revealed at the end - a
    // player killed mid-spin must not be killed by an outcome that had not
    // happened yet, and a winner rolled late would be exactly that bug with
    // the sign flipped: the burst at the press would promise a coin the gun
    // was never going to spin.
    effects: [['$250 PER SPIN', NOTE], ['1/3 EACH: 5 HP,', GOOD], ['15 AMMO, NOTHING', GOOD]],
    ready: (game) => game.credits >= SPIN_COST,
    duration: SPIN_TIME,
    hud: false,
    use: (game, s) => {
      game.credits -= SPIN_COST;
      // 0 heals, 1 pays ammunition, 2 is the one the house keeps.
      s.outcome = (Math.random() * 3) | 0;
      s.click = 0;
      s.spun = 0;
      game.sfx.itemSpin();
      game.effects.shockwave(game.player.pos, ITEM_THEME, 4, 0.45);
    },
    tick: (game, s, dt) => {
      s.spun += dt;
      s.click -= dt;
      if (s.click > 0) return;
      // The clicks accelerate as the reel slows - backwards for a mechanism
      // and exactly right for a countdown, the same trick SIX CHAMBERS
      // plays with its cylinder.
      s.click = 0.13 - Math.min(0.08, s.spun * 0.11);
      game.effects.impact(game.player.eyeInto(_v), 0xff5252, 3, 2, 1.5, 0.2);
    },
    end: (game, s) => {
      const p = game.player;
      // Prize flashes use health green or ammo gold; the machine's own red
      // belongs to the spin and the empty result.
      if (s.outcome === 0) {
        p.heal(5);
        game.ui.banner('WIN: +5 HP');
        game.effects.burst(p.eyeInto(_v), 0x8affc1, 26, 6, 3, 0.6);
        game.effects.shockwave(p.pos, 0x00e676, 6, 0.5);
        game.sfx.jackpot();
      } else if (s.outcome === 1) {
        p.reserveAmmo = Math.min(p.maxReserve, p.reserveAmmo + 15);
        game.ui.banner('WIN: +15 AMMO');
        game.ui.flashReserve();
        game.effects.burst(p.eyeInto(_v), 0xffd600, 26, 6, 3, 0.6);
        game.effects.shockwave(p.pos, 0xffd600, 6, 0.5);
        game.sfx.itemAmmo();
      } else {
        game.ui.banner('BUST');
        // The lid closing, in grey: the one outcome with nothing in it has
        // to ANNOUNCE the nothing, or it reads as the press having failed.
        game.effects.shockwave(p.pos, ITEM_THEME, 5, 0.4);
        game.sfx.boxClose();
      }
    },
}));

export const icon = [
  '........................',
  '......0000000000000.....',
  '.....022222222222220....',
  '.....023232323232320....',
  '.....022222222222220....',
  '.....0000000000000000...',
  '....0222222222222222220.',
  '....02200022200022220...',
  '....02203023203023220...',
  '....02200300300300220...',
  '....02202023202023220..0',
  '....02200022200022220.20',
  '....0220002220002222002.',
  '....02222222222222220.22',
  '....0222222222222222202.',
  '....02222222222222220.2.',
  '....022222222222222202..',
  '.....0000000000000000...',
  '..................0.....',
  '.................020....',
  '................0220....',
  '.................00.....',
  '........................',
  '........................',
];
