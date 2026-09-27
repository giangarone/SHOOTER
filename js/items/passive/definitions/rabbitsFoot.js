import { definePassiveItem } from '../shared.js';

// =========================================================================
// THE REST
// =========================================================================
export const id = 'rabbitsFoot';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: "RABBIT'S FOOT",
    max: 2,
    theme: 0x7cb342,
    // A MULTIPLIER ON EVERY CATEGORY'S CHANCE, applied inside rollDrop where
    // the need term has already been added - so it lifts the floor for a
    // player who is fine and lifts the already-raised chance for a player who
    // is not, in the same proportion. Adding a flat 15 points instead would
    // have been worth four times as much to a full-health player as to a
    // desperate one, which is backwards for a luck charm.
    effects: (n) => [
      ['ENEMY DROPS ' + step(n, pctUp(15)), GOOD],
      ['MORE LIKELY, EVERY KILL', NOTE],
    ],
    apply: (mods, n) => { mods.dropLuck *= 1 + 0.15 * n; },
}));

// THE CHARM, WHOLE. Crimped cap, chain, and the lucky itself - pads down,
// tuft out, someone else walking unlucky.
export const icon = [
  '........................',
  '........................',
  '......2.................',
  '.......2.2..............',
  '........21......3.......',
  '.......42222222343......',
  '.......2424242213.......',
  '.......2222222211.......',
  '.........222221.........',
  '........42222221........',
  '.......4222222221.......',
  '......22222222221.......',
  '.....222222222221.......',
  '......222111122221......',
  '......221111112221......',
  '......222112211222......',
  '.......2222222221.......',
  '.......220222022021.....',
  '.......22.222.22221.....',
  '.......11.211.1111......',
  '........................',
  '........................',
  '........................',
  '........................',
];
