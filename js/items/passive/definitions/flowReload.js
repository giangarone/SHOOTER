import { definePassiveItem } from '../shared.js';

// ---- staying alive ------------------------------------------------------

// A SECOND IN WHICH NOTHING LANDS, ON EVERY RELOAD. The reload is the one
// thing in this game the player does that has never been anything but a cost
// - a second and a half of standing there with no gun - and this turns it
// into cover. What it changes is WHEN a magazine is changed: a reload taken
// while something is winding up is now the correct answer to it.
//
// ON THE ROUNDS ARRIVING, not on the button. A reload interrupted by a death
// or a handover buys nothing, which is the same edge BOTTOM FEEDER's window
// opens on.
//
// THE EXPLOIT IS LEFT OPEN ON PURPOSE, and it is worth naming: fire one
// round, reload, take the second, repeat. startReload refuses a full
// magazine, so every second of cover has to be bought with a trigger pull and
// a whole reload stood through - a rate of fire far below simply shooting,
// and a reserve draining the whole time. A player who wants to be
// untouchable can have it, and they will not kill anything while they are.
export const id = 'flowReload';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'FLOW RELOAD',
    max: 1,
    theme: THEME.flowReload,
    effects: [['EVERY RELOAD:', NOTE], ['1s INVULNERABLE', GOOD]],
    apply: (mods, n) => { mods.flowReload = 1 * n; },
}));
