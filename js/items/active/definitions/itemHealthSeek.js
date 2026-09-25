import { defineActiveItem } from '../shared.js';

export const id = 'itemHealthSeek';

const ITEM_THEME = 0x00e676;

export default defineActiveItem(({ THREE, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'HEALTH & SEEK',
    charge: 40,
    theme: ITEM_THEME,
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
      game.effects.shockwave(game.player.pos, ITEM_THEME, 8, 0.6);
      game.ui.banner('DELIVERED');
      game.sfx.itemHeal2();
    },
}));

export const icon = [
  '........................',
  '........................',
  '........................',
  '.........2222...........',
  '.......24422224.........',
  '......2442222224........',
  '....22422332222221......',
  '....24222332222221......',
  '....22222332224221......',
  '....22233333332221......',
  '....22233303332211......',
  '....22233333332221......',
  '....22222332222111......',
  '....22222222211111......',
  '.....222222112222.......',
  '.............2222.......',
  '...............2222.....',
  '.................332....',
  '...................21...',
  '.....................3..',
  '....................333.',
  '.....................3..',
  '........................',
  '........................',
];
