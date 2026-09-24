import { definePassiveItem } from '../shared.js';

export const id = 'telltale';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'TELLTALE',
    max: 1,
    theme: 0xe91e63,
    // EVERY THIRD HIT ON THE SAME BODY. The count lives on the enemy and dies
    // with it, so it is the exact opposite of Assassin: this one pays for
    // STAYING on a target, and the two together are a build that has an answer
    // whichever way the player prefers to shoot.
    //
    // Counted per TRIGGER PULL and not per pellet - see the _shotHits guard in
    // _resolveHit - or a scattergun would tick the counter eight times a shell
    // and this would read as a permanent crit rather than as a rhythm.
    effects: [['EVERY 3rd HIT ON THE', NOTE], ['SAME ENEMY CRITS', GOOD]],
    apply: (mods, n) => { mods.telltale = 3; },
}));

export const icon = [
  '........................',
  '........................',
  '...................42...',
  '....21...221...21.442...',
  '...2221..221..2222432...',
  '...2221..221..2222322...',
  '...2221..221..222332....',
  '...2221..221..222322....',
  '...2221..221..22332.....',
  '...2221..221..22332.....',
  '...2221..221..23322.....',
  '...2221..221..2332......',
  '...2221..221..2332......',
  '...2221..221..4331......',
  '...2221..221..4331......',
  '...2221..221.44321......',
  '...2221..221.43321......',
  '...2221..222443321......',
  '...2221..222333221......',
  '...1211..222322211......',
  '....11...11332.11.......',
  '...........222..........',
  '........................',
  '........................',
];
