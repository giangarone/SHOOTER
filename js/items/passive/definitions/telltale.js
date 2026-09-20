import { definePassiveItem } from '../shared.js';

export const id = 'telltale';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'TELLTALE',
    max: 1,
    theme: THEME.telltale,
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
