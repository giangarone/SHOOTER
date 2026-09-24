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
// door's wheel - the one image that says the body is the money. Coin slot up
// top, spoked wheel with grip handles around the heart, tally plate below.
export const icon = [
  '........................',
  '........................',
  '.....44442222222211.....',
  '....4422222222222111....',
  '....4222200430022221....',
  '....4222222222222221....',
  '....1111111111111111....',
  '....4422223443222231....',
  '....4223333333333221....',
  '....4223333213333221....',
  '....4223443333313221....',
  '....4433433333313311....',
  '....2431233333113311....',
  '....2223222332223221....',
  '....2223222322223221....',
  '....2223333333111221....',
  '....2122223331222211....',
  '....2200333103331011....',
  '....2222222222222111....',
  '....1111111111111111....',
  '......111......111......',
  '.......11......11.......',
  '........................',
  '........................',
];
