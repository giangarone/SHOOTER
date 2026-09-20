import { defineActiveItem } from '../shared.js';

// =========================================================================
// THE THIRD BLOCK - TWENTY-FOUR MORE
// =========================================================================
//
// What the pool did not have before these, and what each of them was added
// to cover:
//
//   - A PROMISE RATHER THAN A PAYMENT. LIFE INSURANCE and BACKORDER are the
//     first two items in the game that do nothing at the moment they are
//     pressed. One of them is a window that only pays if something goes
//     wrong inside it; the other is a parcel that only pays if the player is
//     still standing when it lands. Every other heal in the pool is a number
//     arriving on the frame of the press.
//   - A DEBT. MEDICAL DEBT and LIFE SENTENCE take their price LATER - at the
//     end of the wave, or for the rest of the run - where BLOOD TAX and OPEN
//     VEIN take theirs now. A cost the player has already forgotten about by
//     the time it arrives is a different decision to one they watch happen.
//   - THE ROOM'S OWN COUNT AS THE PAYLOAD. FAITH HEALING, PICKPOCKET, HEAD
//     COUNT and PHLEBOTOMY all read something off the arena and pay out in
//     proportion to it, which makes them BODY COUNT's cousins: an empty room
//     is an empty press, and knowing that is the skill.
//   - THE WALLET AS AMMUNITION. MONEY SHOT and GOLDEN PARACHUTE join PAY TO
//     WIN as the three items whose real cost is money, and all three are
//     bounded by the same thing: there is no way to earn a credit without
//     killing something.
//
// NOTHING HERE HAS A SYSTEM OF ITS OWN, which is the rule the second block
// set and this one keeps. Four more items run for a window and join the
// running list; one more thing is left in the arena and joins the deployed
// list; the rest write a field the shot path, the melee or the kill sweep
// was already reading.

// ---- the promise, and the debt ------------------------------------------
export const id = 'itemInsurance';

export default defineActiveItem(({ THREE, THEME, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'LIFE INSURANCE',
    charge: 60,
    theme: THEME.holy,
    // THE ONLY ITEM IN THE POOL THAT PAYS OUT FOR A MISTAKE. Ten seconds in
    // which the hit that would have ended the run leaves the player at one
    // health and hands back twenty - so the window is not damage reduction, it
    // is one death cancelled, and only one: the policy is spent by the claim.
    //
    // PRESSED BEFORE THE TROUBLE, WHICH IS THE WHOLE DECISION. AEGIS is eight
    // seconds of nothing landing at all and costs the same sixty; this is ten
    // seconds in which everything lands normally and exactly one of them is
    // survived. A player who presses it and is never in danger has spent a
    // wave's charge on nothing, which is what insurance is.
    //
    // IT RIDES Player.takeDamage, the one place every source of damage in the
    // game ends up - a bullet, a burn, a lava patch, a corpse blast - because
    // a policy that only covered bullets would be a policy the player finds
    // the edge of by dying to a pool.
    effects: [['FOR 10s: SURVIVE ONE', NOTE], ['KILLING BLOW AT 1 HP', GOOD], ['AND HEAL 20', GOOD]],
    duration: 10,
    use: (game) => {
      const p = game.player;
      p.insuredEnd = game.time + 10;
      game.effects.shockwave(p.pos, THEME.holy, 7, 0.6);
      game.effects.burst(p.eyeInto(_v), 0xfff2b0, 26, 5, 3, 0.7);
      game.sfx.itemSurge();
    },
    // CLEARED WHATEVER ENDED IT, claim or clock. `insuredEnd` is the whole of
    // the state and Player.takeDamage zeroes it the moment it pays, so this is
    // only ever tidying up a window nothing happened in.
    end: (game) => { game.player.insuredEnd = 0; },
}));
