import { definePassiveItem } from '../shared.js';

// ---- what your shots carry ----------------------------------------------

// EVERY HIT, TWICE. A quarter of it comes back two seconds later on the same
// body, which is a flat +25% damage to anything that lives that long and
// nothing at all to anything that does not - so it is worth most against the
// big slow types and against a boss, and least against the rushers it would
// have been strongest against if it paid immediately.
//
// THE SECOND BITE DOES NOT BITE. It is booked once, where the round lands,
// and the damage it deals goes through hurtEnemy rather than back through the
// shot path - so a hit cannot schedule a hit that schedules a hit, which is
// the one way a percentage-of-damage effect becomes infinite.
//
// AND IT DIES WITH THE BODY, on DELAYED FUSE's terms and for its reason: what
// is owed to a corpse would otherwise arrive as an unattributable number over
// an empty floor, and a crowded wave would end in a minute of them.
export const id = 'bedbugs';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'BEDBUGS',
    max: 1,
    theme: THEME.bedbugs,
    effects: [['EVERY HIT BITES AGAIN', GOOD], ['2s LATER, AT 25% DMG', NOTE]],
    apply: (mods, n) => { mods.bedbugs = 0.25 * n; mods.bedbugsDelay = 2; },
}));
