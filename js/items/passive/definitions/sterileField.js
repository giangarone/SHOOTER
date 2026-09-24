import { definePassiveItem } from '../shared.js';

// WHITE CELL, AS A PASSIVE ITEM, PAID FOR BY THE HEAL. Every affliction in
// status.js comes off - the burn, the poison, the chill, fear, weakness and
// the curse - and what it costs is the health the player had to spend
// anyway, which is why it is worth most to exactly the builds that are
// already healing and nothing at all to one that never does.
//
// A WHOLE POINT OF HEALING, AND THE THRESHOLD IS THE ENTIRE PICK. Most
// healing in this game arrives as a rate times dt - NANOWEAVE's trickle, DIG
// IN's, SLOW RELEASE's drip, HEALTHY CORE's - and a cleanse that fired on a
// hundredth of a point would not be a cleanse at all, it would be IRON LUNG:
// nothing could ever land on a run carrying any regeneration. So what it
// tests for is a heal the player can SEE arriving, and a trickle stays a
// trickle. See Player.heal.
export const id = 'sterileField';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'STERILE FIELD',
    max: 1,
    theme: 0xdff5ea,
    effects: [['ANY HEAL ALSO CLEARS', NOTE], ['STATUS EFFECTS ON YOU', GOOD]],
    apply: (mods, n) => { mods.sterileField = n; },
}));

export const icon = [
  '........................',
  '.221................221.',
  '.221................221.',
  '.111.......21.......111.',
  '........22222221........',
  '......221111111221......',
  '.....2111......1121.....',
  '.....21....442...21.....',
  '....211....432...121....',
  '....21.....432....21....',
  '....21.....432....21....',
  '...221.44444334444221...',
  '...121.43333333333211...',
  '....21.2222332222221....',
  '....21.....432....21....',
  '....121....432...211....',
  '.....21....432...21.....',
  '.....1221..432.2211.....',
  '......112222222111......',
  '........11121111........',
  '.221.......11.......221.',
  '.221................221.',
  '.111................111.',
  '........................',
];
