import { definePassiveItem } from '../shared.js';

// =========================================================================
// THE CRITICAL HIT, AS A BUILD
// =========================================================================
//
// The crit has been in the game since the first magazine of the first run -
// 5% for 1.5x, in DEFAULT_MODS, deliberately non-zero so the yellow number
// is a thing the player has already seen by the time anything here offers to
// change it. What was missing was anywhere to take it. These six are that,
// and they are built so that no two of them are the same pick:
//
//   DEADEYE and MARKSMAN raise the DICE. More of them, unconditionally.
//   DEAD CENTER trades the dice for the PAYOUT, which is the same expected
//     damage on paper and a completely different feel in the hand.
//   ASSASSIN and TELLTALE do not touch the dice at all - they make a crit a
//     thing you can PLAN, off the target's own history rather than a roll.
//   SWEET SPOT, the active item, is eight seconds of all of it at once.
//
// WHERE THEY ARE RESOLVED. Not here and not in rollCrit(): a crit that
// depends on WHICH BODY was hit cannot be decided at the trigger, because at
// the trigger there is no body yet. rollCrit() still does the dice once per
// trigger pull, exactly as it always did, and Game._resolveHit turns that
// roll into a per-enemy answer at the moment a pellet lands. See the note
// there - it is the one place all six meet.
export const id = 'deadeye';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'DEADEYE',
    max: 1,
    theme: 0xff80ab,
    // Common, and the smaller of the two plain chances, because it is the
    // entry point to the whole family: 5% to 20% is the pick where the yellow
    // numbers stop being a curiosity and start being something the player can
    // feel. Everything else here is worth more once this has been taken.
    effects: [['+15% CRIT CHANCE', GOOD]],
    apply: (mods, n) => { mods.critChance += 0.15 * n; },
}));

// THE EYE THAT CRITS. Lidded, ringed, with a starred pupil and a tear
// glint - the entry point to the whole yellow-number family.
export const icon = [
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '..................4.....',
  '........................',
  '........................',
  '......422222222221......',
  '.....42222233222221.....',
  '.....22222343322221.....',
  '.....23223444432221.....',
  '.....22222333322221.....',
  '.....22222233222221.....',
  '......211111111111......',
  '........2......2........',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
];
