import { definePassiveItem } from '../shared.js';

// THE ONE PICK THAT ROLLS THE BUILD. Every passive item owned is replaced
// with a random one from the whole pool - same slots, fresh picks - and the
// stack counts carry: a HOLLOW POINT x3 becomes three random singles. It
// never removes itself, so the run keeps the verb; and it is the only pick
// in the pool whose value depends entirely on how much the player hates
// what they are holding.
//
// THE SWAP IS NOT AN APPLY(). rebuildMods() replays the owned list from
// defaults on every draft pick, so a swap written there would re-roll the
// build again on the next totem. It happens ONCE, at the pick - see
// Player.takePassiveItem, exactly where SACRIFICE's removal is.
export const id = 'shuffle';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'SHUFFLE',
    max: 1,
    theme: 0x8e6bf0,
    effects: [['REPLACE YOUR PASSIVES', NOTE], ['WITH RANDOM ONES', NOTE]],
    apply: (mods, n) => { mods.shuffle = n; },
}));

// THE DECK, MID-CUT. Two halves of a pack bent into the interleave - the one
// gesture that says "whatever you had, you have new ones now".
export const icon = [
  '........................',
  '........................',
  '........................',
  '.....44433333333441.....',
  '....4111111111111121....',
  '....41............41....',
  '....41............431...',
  '....41............41....',
  '...444444444444444441...',
  '...422222222222222221...',
  '...422222223422222221...',
  '...423022223322230221...',
  '...422322223422223221...',
  '...422232223322223221...',
  '...422222223422222221...',
  '...423222223322232221...',
  '...432222223422222221...',
  '...422222222222222221...',
  '...121111111111111211...',
  '....41............41....',
  '....1244444444444411....',
  '.....11133333333111.....',
  '........................',
  '........................',
];
