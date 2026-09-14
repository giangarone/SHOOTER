import { definePassiveItem } from '../shared.js';

// SPLASH DAMAGE, PAID FOR IN TIME. Every round sticks and does nothing for
// two seconds, then goes off for what it was worth over a small area. It is
// the whole gun turned into a grenade launcher: enormous against a crowd,
// and genuinely bad against the one thing walking at you.
export const id = 'delayedFuse';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'DELAYED FUSE',
    max: 1,
    theme: THEME.delayedFuse,
    effects: [['SHOTS STICK TO ENEMIES', GOOD], ['THEN EXPLODE, 2s LATER', NOTE]],
    apply: (mods, n) => { mods.fuseDelay = 2; mods.fuseRadius = 2.5 * n; },
}));
