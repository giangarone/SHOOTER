import { definePassiveItem } from '../shared.js';

// EVERY BODY IN THE ROOM, THINNER. It is the only pick that changes the
// enemy rather than the player, which also makes it the only one whose value
// never falls off: a fifth off every health bar is a fifth off wave 40's as
// much as wave 4's, where a flat damage number is not.
//
// NOT BOSSES. A boss is a fight with a shape, and EXECUTIONER already sells
// half a boss's health for a piece of the player's own bar - a pick that
// handed over a fifth of it for nothing would make that one a worse version
// of this.
export const id = 'underfed';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'UNDERFED',
    max: 1,
    theme: THEME.underfed,
    effects: [['ENEMIES HAVE 20%', GOOD], ['LESS HEALTH', NOTE], ['NOT BOSSES', NOTE]],
    apply: (mods, n) => { mods.enemyHpMult *= Math.pow(0.8, n); },
}));
