import { definePassiveItem } from '../shared.js';

// NO-HIT BONUS AT WAVE SCALE, paid inside a wave instead of at the end of
// one. Twenty bodies without being touched is one good stretch rather than
// one perfect wave, so this pays a player who is playing well right now.
export const id = 'killStreak';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'KILL STREAK',
    max: 1,
    theme: THEME.killStreak,
    effects: [['20 KILLS WITHOUT', NOTE], ['BEING HIT: HEAL 5,', GOOD], ['+10 AMMO', NOTE]],
    apply: (mods, n) => { mods.killStreak = 20; mods.streakHeal = 5 * n; mods.streakAmmo = 10 * n; },
}));
