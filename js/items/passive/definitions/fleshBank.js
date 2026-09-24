import { definePassiveItem } from '../shared.js';

// THE BODY AS AN ACCOUNT. Ten max HP off the top, and every health crate
// banks one BACK - permanently, on top of its heal - so the pick is a
// mortgage the run pays down by playing. The cost is replayed by
// rebuildMods (a flat take, EXECUTIONER's shape) and the repayments ride
// the crate's own bank on the Player, for GRISTLE's reason: one shared
// ceiling would let either pick eat the other's.
//
// THE ACCOUNT SETTLES AT THE CRATE, not at the shop: the run pays the
// ten the moment the pick is taken and earns it back one plate at a time,
// so the build is behind from the first wave and level after ten crates.
export const id = 'fleshBank';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'FLESH BANK',
    max: 1,
    theme: 0x689f38,
    effects: [['-10 MAX HP', BAD], ['HEALTH CRATES GIVE', GOOD], ['+1 MAX HP BACK', GOOD]],
    apply: (mods, n) => {
      mods.maxHpFlat += 10 * n;
      mods.fleshBank = n;
      mods.fleshBankGain = 1 * n;
    },
}));

// A HEART IN A VAULT DOOR. The bank: a strongbox with the heart set into the
// door's wheel - the one image that says the body is the money.
export const icon = [
  '........................',
  '..22222222222222222.....',
  '..233333333333333332....',
  '..233333333333333332....',
  '..233333322333333332....',
  '..233333233332333332....',
  '..233332333332333332....',
  '..233323344433323332....',
  '..233323444443233332....',
  '..233234444444332332....',
  '..233234444444332332....',
  '..233323444443233332....',
  '..233323344433323332....',
  '..233332333332333332....',
  '..233333233332333332....',
  '..233333322333333332....',
  '..233333333333333332....',
  '..233333333333333332....',
  '..2233333333333333322...',
  '...22222222222222222....',
  '..221122222222221122....',
  '..222222222222222222....',
  '........................',
  '........................',
];
