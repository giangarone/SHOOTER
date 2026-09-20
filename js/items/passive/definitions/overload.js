import { definePassiveItem } from '../shared.js';

export const id = 'overload';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'OVERLOAD',
    max: 1,
    theme: THEME.overload,
    // A fraction of MAX HP rather than a flat number, so it stays worth firing
    // the magazine dry on wave 40 as much as on wave 4. It is the one thing in
    // the pool that scales with the enemy instead of with the build - and the
    // health it charges per use is why it needs no drawback beyond itself.
    effects: [['EMPTY MAGAZINE:', NOTE], ['ALL ENEMIES TAKE 20%', GOOD], ['OF THEIR MAX HP', NOTE]],
    apply: (mods, n) => { mods.overloadFrac = 0.2 * n; },
}));
