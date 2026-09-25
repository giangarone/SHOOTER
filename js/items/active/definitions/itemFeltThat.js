import { defineActiveItem } from '../shared.js';

// ---- melee, for once ----------------------------------------------------
export const id = 'itemFeltThat';

const ITEM_THEME = 0x00e5c0;

export default defineActiveItem(({ THREE, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'EVERYONE FELT THAT',
    charge: 30,
    theme: ITEM_THEME,
    // THE ONLY ITEM IN THE POOL THAT IS ABOUT THE BUTT OF THE GUN. Melee is
    // otherwise a thing the player does when something is already on top of
    // them - one committed swing, a double bounty, and a real risk - and for
    // eight seconds this makes it the best attack in the game: five times the
    // damage, and every body in the arena takes the same number the one you
    // actually hit did.
    //
    // IT STILL NEEDS A TARGET. The swing that connects is what pays out, so
    // eight seconds of swinging at air is eight seconds of nothing - which is
    // what keeps this a melee item rather than a room-clear with an animation
    // in front of it. The player has to walk into the crowd to use it, which
    // is the same thing melee has always asked.
    //
    // AND THE MELEE KILL DOUBLE RIDES ON TOP, untouched: everything this kills
    // with the swing is tagged the way any melee kill is, so a crowd taken
    // down by one hit pays a crowd's worth of doubled bounties.
    effects: [['MELEE: 5x DMG FOR 8s,', GOOD], ['STRIKING EVERY ENEMY', NOTE]],
    duration: 8,
    use: (game) => {
      const p = game.player;
      p.meleeMult = 5;
      p.meleeShare = 1;
      game.effects.shockwave(p.pos, ITEM_THEME, 8, 0.6);
      game.effects.burst(p.eyeInto(_v), 0x00e5c0, 26, 6, 3, 0.7);
      game.sfx.itemFrenzy();
    },
    end: (game) => {
      game.player.meleeMult = 1;
      game.player.meleeShare = 0;
    },
}));

export const icon = [
  '........................',
  '........................',
  '............1...........',
  '.........1113111........',
  '.......111..1..111......',
  '.....411....1....11.....',
  '.....13...........31....',
  '....11.1..44441....11...',
  '....1.....33333.....1...',
  '...11....4422221....11..',
  '...1.....4222221.....1..',
  '...1....44232221.....1..',
  '..1311..42224221...1131.',
  '...1....42222321.....1..',
  '...1....12222221.....1..',
  '...11....4222221....11..',
  '....1....1111111....1...',
  '....11.1...........11...',
  '.....43...........31....',
  '.....111....1....11.....',
  '.......111..1..111......',
  '.........1113111........',
  '............1...........',
  '........................',
];
