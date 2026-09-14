import { defineActiveItem } from '../shared.js';

export const id = 'itemAmmo';

export default defineActiveItem(({ THREE, THEME, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'BANDOLIER',
    charge: 40,
    theme: THEME.brass,
    // THE ONLY ITEM IN THE POOL THAT ANSWERS THE RESERVE. Ammo is the one
    // resource with no button on it: health has the TRAUMA KIT, the crowd has
    // six answers, and running dry has always meant walking to a station or to
    // a crate on the floor. Thirty rounds is a station's worth in the middle of
    // a fight, at the moment the player cannot afford to cross the room.
    //
    // CLAMPED AT THE CAP, and the press is still allowed at a full reserve -
    // refusing it would be a rule the player discovers by being denied, and the
    // pool already has exactly one refusal in it (LANCE) for a reason that does
    // not apply here.
    //
    // TRIPLE TAP AND AMMO HOARDER BOTH TOUCH IT and neither is special-cased:
    // thirty rounds is thirty ROUNDS, so a build spending three per shot gets
    // ten shots out of this, and a build with a doubled reserve has more room
    // to put them in. That is the honest reading of the card.
    effects: [['+30 RESERVE ROUNDS', GOOD]],
    use: (game) => {
      const p = game.player;
      const before = p.reserveAmmo;
      p.reserveAmmo = Math.min(p.maxReserve, p.reserveAmmo + 30);
      game.effects.shockwave(p.pos, THEME.brass, 5, 0.45);
      // Brass off the gun rather than a wash over the player: the thing that
      // changed is what is in the weapon, so the tell is at the weapon.
      game.effects.burst(p.muzzleInto(_v), 0xffb300, 18, 4, 2.4, 0.5);
      // The number in the corner is where a player actually reads their
      // ammunition - the puff at the muzzle is lost in a firefight. Same flare
      // BRASS ECHO's refund uses, for the same reason.
      if (p.reserveAmmo > before) game.ui.flashReserve();
      game.sfx.itemAmmo();
    },
}));
