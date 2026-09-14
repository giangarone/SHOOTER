import { defineActiveItem } from '../shared.js';

export const id = 'itemStone';

export default defineActiveItem(({ THREE, THEME, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'BLOOD FROM STONE',
    charge: 30,
    theme: THEME.blood,
    // MONEY BECOMES MEDICINE, and only while it is running - which turns a
    // wave's payout into a heal exactly once, and makes the press a question
    // about timing rather than about health. Best used on the corpse of
    // something big, which is the same moment the floor is covered.
    //
    // Eight seconds, not five. Five almost never overlaps an actual payout:
    // orbs arrive on a kill and are picked up over the following few seconds,
    // and a window shorter than the collection is a window that mostly misses.
    effects: [['CREDITS PICKED UP', GOOD], ['ALSO HEAL 1 HP, 8s', NOTE]],
    duration: 8,
    use: (game) => {
      game.player.orbHealEnd = game.time + 8;
      game.money.vacuum();
      game.effects.shockwave(game.player.pos, THEME.blood, 8, 0.55);
      game.sfx.itemSurge();
    },
    end: (game) => { game.player.orbHealEnd = 0; },
}));
