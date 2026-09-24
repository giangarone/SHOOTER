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
    theme: 0x9575cd,
    effects: [['REPLACE YOUR PASSIVES', NOTE], ['WITH RANDOM ONES', NOTE]],
    apply: (mods, n) => { mods.shuffle = n; },
}));

// THE DECK, MID-CUT. Two halves of a pack bent into the interleave - the one
// gesture that says "whatever you had, you have new ones now".
export const icon = [
  '........................',
  '...22..........2222.....',
  '..2332........2333322...',
  '.233322......233333322..',
  '.2333322....2333333322..',
  '.23333322..23333333322..',
  '.233333322.23333333322..',
  '.233333332.2333333332...',
  '.23333333.22333333332...',
  '.2333333.222333333332...',
  '.233333.2222333333332...',
  '.23333.2222333333332....',
  '.2333.22222333333332....',
  '.233.222222333333332....',
  '.233.222222333333332....',
  '.233.222222333333332....',
  '.233.222222333333332....',
  '.233.222222333333332....',
  '.233.222222333333332....',
  '.233.222222333333332....',
  '.22332222222333333322...',
  '.222332222223333333322..',
  '..2333222222333333322...',
  '...2222......2222222....',
];
