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

// THE THIRD BEAT. A pulse trace with its rhythm showing: two small ticks
// and then the spike that matters, crowned with a star - stay on the body
// and the count pays out.
export const icon = [
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '.................3......',
  '................343.....',
  '...............33433....',
  '...........3....333.....',
  '...........3.....3......',
  '......3...333...343.....',
  '.....333.33333.33433....',
  '..22224222242222242222..',
  '..11111111111111111111..',
  '......3....3....343.....',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
];
