import { definePassiveItem } from '../shared.js';

// THE AIR, CROUCHED, IS A WEAPON. Crouch in midair and the fall becomes a
// slam: everything within three metres is staggered and takes three times
// base damage. The verb is the one the slide buffer already owns - a crouch
// press in the air - so the pick does not add a binding, it gives the
// existing midair press a second meaning when it is pressed as an EDGE.
//
// THE STAGGER AND THE DAMAGE ARE ONE EVENT: bodies are shoved as the blow
// lands, exactly as KNOCKOUT DROPS shoves them, so the slam buys the same
// second of space the shove always has. A boss shrugs the shove (the rule
// every push in the game keeps) and keeps the damage, which is the honest
// reading of a card about the floor, not about giants.
export const id = 'stiltLegs';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'STILT LEGS',
    max: 1,
    theme: THEME.stiltLegs,
    effects: [['CROUCH IN MIDAIR:', NOTE], ['SLAM DOWN. 3x DAMAGE', GOOD], ['+ STAGGER WITHIN 3m', GOOD]],
    apply: (mods, n) => { mods.stiltLegs = n; },
}));

// THE STILTS. Two poles with footrests and a figure balanced on them - the
// one silhouette that means "high up, coming down hard".
export const icon = [
  '.......23333332.........',
  '......2333333322........',
  '......2334433322........',
  '......2333333322........',
  '.......23333332.........',
  '........................',
  '.....22222222222........',
  '.....22222222222........',
  '.....22112222222........',
  '.....22112222222........',
  '........................',
  '......222....222........',
  '......222....222........',
  '......222....222........',
  '......222....222........',
  '......222....222........',
  '.....2233....3322.......',
  '.....2233....3322.......',
  '......222....222........',
  '......222....222........',
  '......222....222........',
  '......222....222........',
  '.....2222....2222.......',
  '........................',
];
