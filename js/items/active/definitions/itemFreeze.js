import { defineActiveItem } from '../shared.js';

export const id = 'itemFreeze';

const ITEM_THEME = 0x7fe3ff;

export default defineActiveItem(({ THREE, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'CRYO PULSE',
    charge: 40,
    theme: ITEM_THEME,
    // The whole floor at once, through the same per-enemy status a cryo round
    // applies - which means bosses downgrade it to a slow through the
    // resistance block they already carry (see freezeSlow on a boss's stat block in
    // js/enemies/). That is
    // the correct answer and not a special case: an item that could stop a boss
    // dead for five seconds every twenty would be the only boss strategy there is.
    //
    // The cheapest item in the pool because it does no damage. It buys
    // distance, and distance is what the player then has to use - and the
    // player finds that out by carrying it, not by reading it.
    effects: [['FREEZE ALL ENEMIES', GOOD], ['FOR 5s', NOTE]],
    use: (game) => {
      for (const e of game.enemies) e.applyStatus('freeze', 5);
      game.effects.shockwave(game.player.pos, ITEM_THEME, 26, 0.9);
    },
}));

export const icon = [
  '........................',
  '.........222221.........',
  '......221112111221......',
  '.....2111..42..1121.....',
  '....211...4432...121....',
  '...211....4332....121...',
  '..221.....4332.....221..',
  '..22342...4332...44421..',
  '..1123342.4332.4442211..',
  '.21..23334433344322..21.',
  '.21...223333333222...21.',
  '.21.....43322332.....21.',
  '.21.....43322332.....21.',
  '.21...444333333342...21.',
  '.11..44322333223332..11.',
  '..2244222.4322.2233421..',
  '..22222...432....22321..',
  '..121.....432......211..',
  '...121....432.....211...',
  '....121...232....211....',
  '.....1221..42..2211.....',
  '......111222221111......',
  '.........111111.........',
  '........................',
];
