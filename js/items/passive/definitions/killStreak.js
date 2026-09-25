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

// TWENTY BODIES, COUNTED BIG. The number is the whole pick, with the heal
// it pays wearing a heart and the ammunition wearing a round.
export const icon = [
  '........................',
  '........................',
  '........................',
  '....4..............442..',
  '...................4331.',
  '.....44222..222221.331..',
  '.........2..444..1..1...',
  '.........2..4....1......',
  '.........1..4....1......',
  '.....22222..4....1......',
  '........4...4....1......',
  '.......2....4....1......',
  '......2.....4....1......',
  '.....2......4....1......',
  '....422222..4....1......',
  '....111111..211111......',
  '........................',
  '.44................4....',
  '.23..1..................',
  '.1......................',
  '........................',
  '........................',
  '........................',
  '........................',
];
