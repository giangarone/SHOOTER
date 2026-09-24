import { definePassiveItem } from '../shared.js';

// ---- the magazine, read as a number rather than as a supply --------------

// THE COUNT IN THE CORNER BECOMES A THING TO PLAY. Half of every magazine is
// a fifth more damage, and which half is decided by a number the player has
// been watching since the first wave and has never once been asked to think
// about. Owned alone it is +20% on every other shot; owned with EVEN BETTER
// it is +20% on all of them, which is the one pair in the pool that is
// deliberately worth assembling.
//
// READ OFF `magAtShot`, never off the live count. By the time anything
// downstream looks the magazine has already been billed - by one round, or by
// three under TRIPLE TAP, or by none at all under BELT FEED - and the card
// names the count the player SAW when they pulled the trigger.
export const id = 'oddCouple';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'ODD COUPLE',
    max: 1,
    theme: 0x9ecbff,
    effects: [['+20% DAMAGE', GOOD], ['WHEN THE MAGAZINE', NOTE], ['HOLDS AN ODD COUNT', NOTE]],
    apply: (mods, n) => { mods.oddCouple = 0.2 * n; },
}));

export const icon = [
  '........................',
  '........................',
  '......2222222221........',
  '......2222222221........',
  '......1222222211........',
  '.......22222221.........',
  '.......22222221.........',
  '.......20000001.........',
  '.......20000001.........',
  '.......22222221.........',
  '.......20000001.........',
  '.......20000001.........',
  '.......22222221.........',
  '.......22222221.........',
  '.......22222221.........',
  '.......22222221.........',
  '.......23333331.44442...',
  '.......23333331.22222...',
  '.......22222221.........',
  '.......22222221.........',
  '.......22222221.........',
  '.......11111111.........',
  '........................',
  '........................',
];
