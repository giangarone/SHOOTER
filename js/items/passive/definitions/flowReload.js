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

export const icon = [
  '........................',
  '.........444442.........',
  '......444422233442......',
  '.....442222..222332.....',
  '....4222........2232....',
  '...422............232...',
  '..442....2222221...432..',
  '..422....1222211...232..',
  '..42......22221.....42..',
  '.442......23331.....432.',
  '.422......23331.....232.',
  '.42.......22221......42.',
  '.42.......23331......42.',
  '.432......23331.....442.',
  '.232......22221.....422.',
  '..42......23331.....42..',
  '..432.....23331....442..',
  '..232.....22221....422..',
  '...232....22221...422...',
  '....2342..11111.4422....',
  '.....232........422.....',
  '......22...42...22......',
  '...........42...........',
  '..........2222..........',
];
