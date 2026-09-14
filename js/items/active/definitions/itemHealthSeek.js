import { defineActiveItem } from '../shared.js';

export const id = 'itemHealthSeek';

export default defineActiveItem(({ THREE, THEME, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'HEALTH & SEEK',
    charge: 40,
    theme: THEME.vitality,
    // SEVENTY-FIVE HEALTH, SCATTERED WHERE THE PLAYER IS NOT. Three plates at
    // the crate's own twenty-five, spawned on open floor anywhere in the arena
    // - so what this item hands out is not a heal, it is three reasons to go
    // somewhere, and going somewhere in the middle of a wave is the expensive
    // part.
    //
    // THEY OVERHEAL, because they are real health pickups and that is what a
    // health pickup does (twenty-five over the cap - see POWERUP_TYPES). This
    // is the only way in the game to put yourself over your own maximum on
    // purpose, and it costs a walk across a live arena to do it.
    //
    // AND THEY TIME OUT. Thirty seconds like every other plate, which is what
    // stops this being a bank: an item that let the player stockpile health
    // around the map would make the wave break the safest time to press it,
    // and the wave break is exactly when it should be worth least.
    effects: [['SPAWN 3 HEALTH PICKUPS', GOOD], ['AROUND THE ARENA', NOTE]],
    use: (game) => {
      game._scatterHealth(3);
      game.effects.shockwave(game.player.pos, THEME.vitality, 8, 0.6);
      game.ui.banner('DELIVERED');
      game.sfx.itemHeal2();
    },
}));
