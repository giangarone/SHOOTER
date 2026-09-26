import { definePassiveItem } from '../shared.js';

// ---- what happens around you --------------------------------------------

// PANIC TURRET, BOUGHT WITH KILLS INSTEAD OF WITH BLOWS. That pick answers a
// run that is losing and this one answers a run that is winning, which is why
// they are the same gun at two different tenures - ten seconds against five,
// and only the PLAYER'S kills pay: a sentry's own bodies are tagged where it
// fires (see Turret.update) and skipped by the tally, or the gun stands up
// its own replacement every ten and never stops.
//
// IT IS THE ITEM'S OWN TURRET, unchanged: same class, same one-of-the-
// player's-shots per round, same half-beat. Its own cap, counted over the
// deployed list for the reason PANIC TURRET's is - a turret can be retired by
// MAX_DEPLOYED's eviction or by its own clock, and a counter would have to be
// decremented in both places.
export const id = 'quorum';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'QUORUM',
    max: 1,
    theme: 0xf9b233,
    effects: [['EVERY 10 KILLS:', NOTE], ['A FREE TURRET, 5s', GOOD]],
    apply: (mods, n) => { mods.quorumEvery = 10; mods.quorumLife = 5; mods.quorumMax = 3 * n; },
}));

export const icon = [
  '........................',
  '........................',
  '.44442..................',
  '.22222..................',
  '........................',
  '.44442..................',
  '.22222..................',
  '........................',
  '........................',
  '.......22242222221......',
  '.......23333222221......',
  '.......23333322222222221',
  '.......23333222222222221',
  '.......22333222221111111',
  '.......22222222221......',
  '.......11222221111......',
  '.........112111.........',
  '.........1.21.1.........',
  '........21.21.21........',
  '........11.21.11........',
  '.......21..21..21.......',
  '.......21..21..21.......',
  '.......11..11..11.......',
  '........................',
];
