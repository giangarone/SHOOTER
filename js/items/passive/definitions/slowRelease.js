import { definePassiveItem } from '../shared.js';

// TWICE THE CRATE, PAID OUT OVER TWENTY SECONDS. Against NANOWEAVE (a rate
// that runs forever out of combat) this is a POOL - a fixed amount owed,
// draining at its own rate - which is what lets two crates stack honestly:
// each one adds its fifty and its own 2.5 a second, so a player who walks
// over two heals at five a second for twenty seconds rather than at 2.5 for
// forty.
//
// THE TWENTY SECONDS ARE THE COST. Fifty health is enormous and none of it
// is there on the frame the crate is taken, so a crate grabbed at 10 HP with
// something still shooting does not save the run - it has to be taken BEFORE
// it is needed, which is the one thing a health crate has never asked for.
export const id = 'slowRelease';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'SLOW RELEASE',
    max: 1,
    theme: THEME.slowRelease,
    effects: [['HEALTH CRATES HEAL 2x,', GOOD], ['BUT OVER 20 SECONDS', NOTE]],
    apply: (mods, n) => { mods.slowRelease = 1 + n; mods.slowReleaseTime = 20; },
}));
