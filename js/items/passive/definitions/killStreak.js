import { definePassiveItem } from '../shared.js';

// NO-HIT BONUS AT WAVE SCALE, paid inside a wave instead of at the end of
// one. Twenty bodies without being touched is one good stretch rather than
// one perfect wave, so this pays a player who is playing well right now.
export const id = 'killStreak';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'KILL STREAK',
    max: 1,
    theme: 0xaed581,
    effects: [['20 KILLS WITHOUT', NOTE], ['BEING HIT: HEAL 5,', GOOD], ['+10 AMMO', NOTE]],
    apply: (mods, n) => { mods.killStreak = 20; mods.streakHeal = 5 * n; mods.streakAmmo = 10 * n; },
}));

export const icon = [
  '........................',
  '........................',
  '..........44442.........',
  '..........43332.........',
  '.......44443333442......',
  '.......43333333332......',
  '.......43333333332......',
  '.......43333333332......',
  '.......22233332222......',
  '..........43332.........',
  '..........23222.........',
  '...........21...........',
  '..........2221..........',
  '.........222221.........',
  '........22111221........',
  '.......2211..1221.......',
  '......2211.21.1221......',
  '.....2211.2221.1221.....',
  '....2211.222221.1221....',
  '....211.22111221.121....',
  '....11.2221..2221.11....',
  '......222222222221......',
  '.....22222222222221.....',
  '....1111111111111111....',
];
