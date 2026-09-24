import { defineActiveItem } from '../shared.js';

export const id = 'itemMagDump';

export default defineActiveItem(({ THREE, THEME, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'MAG DUMP',
    charge: 10,
    theme: THEME.shrapnel,
    // THE WHOLE MAGAZINE, AS ONE CONE, NOW. LANCE is the other item that
    // spends the ammunition and it is the exact opposite shape: that one is
    // thirty rounds as a single line through everything, this is however many
    // are left thrown out in a wide fan that stops at the first thing each
    // pellet touches. One is a sniper's answer and one is a panicking one.
    //
    // TEN POINTS, WHICH IS ALMOST NOTHING - only BLINK DRIVE's three is
    // cheaper among the items that cost enemies at all - because the magazine
    // is the price and the magazine is real. It is worth nothing at
    // all on an empty gun (it refuses, out loud, for LANCE's reason) and it
    // costs a full reload every time it is pressed.
    //
    // IT IS THE PLAYER'S OWN ROUNDS, fired through the same pellet path a
    // trigger pull uses - so every passive item in the build, every status on
    // the ammunition and every crit rule applies to all of them, and nothing
    // here has an opinion about damage at all.
    effects: [['EMPTY YOUR MAGAZINE', GOOD], ['AS ONE WIDE BLAST', NOTE]],
    // A press on an empty gun would spend the charge and fire nothing, which
    // is the failure LANCE's gate exists to prevent - same voice, same reason.
    ready: (game) => game.player.mag > 0,
    use: (game) => { game.magDump(); },
}));

export const icon = [
  '........................',
  '......2221..............',
  '.122222221..............',
  '..22222221..............',
  '..222222221.............',
  '..122222221.............',
  '...222222221............',
  '...222222221............',
  '...1222221111...........',
  '....211111111...........',
  '....111111111..4442.....',
  '....1111111111.4332.4442',
  '....111111.....4332.4332',
  '.....1.........4332.4332',
  '...............4332.4332',
  '...............4444.4332',
  '.........4442..444..4444',
  '.........4332..4332..44.',
  '.........4332..4332.....',
  '.........4332..4332.....',
  '.........4444..4332.....',
  '.........4444..4444.....',
  '..........44....444.....',
  '................44......',
];
