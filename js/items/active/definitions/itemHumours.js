import { defineActiveItem } from '../shared.js';

export const id = 'itemHumours';

const ITEM_THEME = 0x7b1fa2;

export default defineActiveItem(({ THREE, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'FOUR HUMOURS',
    charge: 40,
    theme: ITEM_THEME,
    // EVERY ELEMENT IN THE GAME, ONE ROUND AT A TIME. The point is not the
    // damage - each of the four is weaker than the passive item that owns it -
    // it is that a crowd caught by eight seconds of this is burning AND
    // poisoned AND frozen AND arcing, and no draft the player could actually
    // assemble ever does all four at once.
    //
    // It cycles per SHOT and not per pellet, so one trigger pull is one
    // element however many pellets were in it - the same rule Hot Streak and
    // Devil's Gamble already follow.
    effects: [['SHOTS CYCLE FIRE, ICE,', GOOD], ['POISON, ARC, FOR 8s', NOTE]],
    duration: 8,
    use: (game) => {
      game.player.elementCycle = 0;
      game.effects.shockwave(game.player.pos, ITEM_THEME, 6, 0.55);
      game.sfx.itemSurge();
    },
    end: (game) => { game.player.elementCycle = -1; },
}));

export const icon = [
  '........................',
  '........................',
  '.........222021.........',
  '.......2222203321.......',
  '.....22222220333321.....',
  '....2222222203333321....',
  '....2222222203333331....',
  '...222222222033333331...',
  '...222222222033333331...',
  '..22222222220333333331..',
  '..22222222222233333331..',
  '..22222222222222222221..',
  '..000000002222000000000.',
  '..23333333222222222221..',
  '..13333333320222222211..',
  '...233333332022222221...',
  '...133333332022222211...',
  '....2333333202222221....',
  '....1233333202222211....',
  '.....11333320222111.....',
  '.......1133202111.......',
  '.........111011.........',
  '............0...........',
  '........................',
];
