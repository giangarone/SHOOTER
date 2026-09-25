import { defineActiveItem } from '../shared.js';

// ---- windows on the player ---------------------------------------------
export const id = 'itemRate';

const ITEM_THEME = 0xff9500;

export default defineActiveItem(({ THREE, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'RED LINE',
    charge: 30,
    theme: ITEM_THEME,
    // Rides fireRateMult and fireRateBoostEnd - the fire-rate PICKUP's own two
    // fields - so it expires through machinery that already exists and shows
    // in the buff strip without being taught to, exactly the way OVERDRIVE
    // rides the rage pickup's. Math.max for the same reason: a pickup landing
    // on top of this must not downgrade it.
    //
    // Six seconds at eighteen, against OVERDRIVE's five at twenty. Rate is
    // worth slightly less than damage in a game where the magazine is finite -
    // twice the rate is also twice the reloads.
    effects: [['DOUBLE FIRE RATE', GOOD], ['FOR 6s', NOTE]],
    use: (game) => {
      const p = game.player;
      p.fireRateMult = Math.max(p.fireRateMult, 2);
      const end = game.time + 6;
      if (end > p.fireRateBoostEnd) {
        p.fireRateBoostEnd = end;
        p.fireRateBoostFull = 6;
      }
      game.effects.shockwave(p.pos, ITEM_THEME, 6, 0.55);
      game.sfx.itemSurge();
    },
}));

export const icon = [
  '........................',
  '........................',
  '........................',
  '..............33........',
  '........22222222........',
  '......224222223332......',
  '.....22444444403331.....',
  '.....24444444403321.....',
  '.....24444444044321.....',
  '.....22444440444221.....',
  '.....22444000444221.....',
  '.....22240040042211.....',
  '.....22204444042211.....',
  '.....22220444022111.....',
  '.....22222222222211.....',
  '......111111111111......',
  '..........2221..........',
  '....33..................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
];
