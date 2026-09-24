import { defineActiveItem } from '../shared.js';

export const id = 'itemLeech';

export default defineActiveItem(({ THREE, THEME, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'HAEMOPHAGE',
    charge: 60,
    theme: THEME.blood,
    // TWENTY SHOTS THAT HIT, not twenty trigger pulls - a magazine emptied
    // into a wall must not be a heal at all, and requiring the hit is also
    // what makes the item something the player has to shoot WELL to spend.
    //
    // ONE HP A HIT, AND THAT IS THE WHOLE SHAPE. Five a hit was a second
    // health bar arriving in four bursts; one a hit is twenty points that
    // accrue while the player does the thing they were going to do anyway, so
    // the item is a slow refill earned by accuracy rather than a heal with a
    // strange trigger on it.
    //
    // THERE IS NO CLOCK ON IT. There used to be a twenty-second backstop, on
    // the reasoning that a player could otherwise bank a charge through a wave
    // break and open the next fight already loaded - which is true, and is
    // also just the item being carried rather than spent. Twenty hits is a
    // real cost at sixty points of charge, and a window that expired with
    // hits left on it was the item silently taking back what it granted.
    //
    // WITH NO DURATION IT NEVER JOINS THE RUNNING LIST, which is why there is
    // no tick and no end here: `leechShots` is the entire state, it is spent
    // by the shot path in main.js, and it is cleared with the rest of the run
    // on a death or a restart (see Player.reset).
    effects: [['NEXT 20 HITS HEAL 1 HP', GOOD], ['NO TIME LIMIT', NOTE]],

    use: (game) => {
      game.player.leechShots = 20;
      game.effects.shockwave(game.player.pos, THEME.blood, 6, 0.5);
      game.sfx.itemSurge();
    },
}));

export const icon = [
  '........................',
  '........................',
  '........................',
  '...2222224442...........',
  '...22222303332..........',
  '...2222230033342........',
  '...2222230033333442.....',
  '...22222233223333332....',
  '...222222122.22233332...',
  '...2222221......23332...',
  '...2222221.......4332...',
  '...2222221.......4332...',
  '...2222221.......4332...',
  '...2222221.......43332..',
  '...2222221.......43322..',
  '...2222221......44322...',
  '...1222211....444322....',
  '....22221....443222.....',
  '....12211...44322.......',
  '.....111....4322........',
  '......1.....222.........',
  '......1.................',
  '........................',
  '........................',
];
