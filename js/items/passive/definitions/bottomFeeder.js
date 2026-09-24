import { definePassiveItem } from '../shared.js';

// DAMAGE OFF AN EMPTY GUN. The only pick in the pool that pays for running
// dry, which is the one thing every other ammunition pick in the game is
// trying to stop the player doing.
export const id = 'bottomFeeder';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'BOTTOM FEEDER',
    max: 1,
    theme: 0xc0ca33,
    effects: [['RELOAD ON AN EMPTY', NOTE], ['MAG: +20% DMG FOR 5s', GOOD]],
    apply: (mods, n) => { mods.bottomFeed = 0.2 * n; mods.bottomTime = 5; },
}));

export const icon = [
  '........................',
  '........................',
  '........................',
  '........................',
  '.................42.....',
  '................4432....',
  '................4332....',
  '...............223222...',
  '....2222222221...42.....',
  '....2222222221...42.....',
  '....1222222211...42.....',
  '.....22222221....42.....',
  '.....22000001....42.....',
  '.....22000001....42.....',
  '.....22000001....42.....',
  '.....22000001....42.....',
  '.....22000001....42.....',
  '.....22000001....42.....',
  '.....22000001....42.....',
  '.....22000001....42.....',
  '.....22000001....42.....',
  '.....22000001....42.....',
  '.....11111111....22.....',
  '........................',
];
