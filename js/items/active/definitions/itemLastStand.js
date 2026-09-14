import { defineActiveItem } from '../shared.js';

// ---- the health bar, four ways -----------------------------------------
export const id = 'itemLastStand';

export default defineActiveItem(({ THREE, THEME, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'WATERLINE',
    charge: 40,
    theme: THEME.vitality,
    // A FLOOR, NOT A HEAL, and it is worth less than TRAUMA KIT at every
    // health total above twenty-five missing - which is most of them. What it
    // buys is the bottom of the bar: at eight health it is a fifty-point heal
    // on a forty-second timer, and that is the only place it is the best item in
    // the pool. Forty seconds, because an item that is dead weight two thirds of
    // the time has to be there when the third arrives.
    effects: [['HEAL TO HALF HEALTH', GOOD], ['NO EFFECT ABOVE HALF', NOTE]],
    use: (game) => {
      const p = game.player;
      const line = p.maxHealth * 0.5;
      if (p.health >= line) {
        // A press that does nothing has to SAY it did nothing, or it reads as
        // a dropped input. The same distinction tryActiveItem draws between an empty
        // slot and an uncharged one.
        game.sfx.denied();
        game.effects.shockwave(p.pos, THEME.vitality, 3, 0.3);
        return;
      }
      p.health = line;
      game.effects.shockwave(p.pos, THEME.vitality, 7, 0.6);
      game.effects.burst(p.eyeInto(_v), 0x8affc1, 24, 5, 3, 0.6);
      game.sfx.itemHeal2();
    },
}));
