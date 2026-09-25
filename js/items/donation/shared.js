// Donation rewards are permanent, one-copy build items. They use the passive
// item's effect vocabulary and modifier replay, but live in catalogues of
// their own so neither the totem nor active-item pools can ever roll them.
import { GOOD, BAD, NOTE } from '../passive/shared.js';

export { GOOD, BAD, NOTE };

const CONTEXT = Object.freeze({ GOOD, BAD, NOTE });

export function defineDonationItem(build) {
  return build(CONTEXT);
}

// AMMO ALCHEMIST's bank, in the order the card names. Read by _landShot in
// main.js, which owns every other per-shot status - putting the list here
// rather than there is what keeps the reward's whole definition in its own
// directory, exactly as WAVETABLE lives in items/passive/index.js.
//
// Rental-strength numbers on FOUR HUMOURS' terms: what the crate sells is
// having any one of the five for eight seconds, not any one of them at the
// strength of the dedicated pick that owns it. `power` is a multiplier on the
// shared status tick where the status has one; slow, fear and the arc have
// none and leave it at zero. The arc is not a status at all - _landShot reads
// it as a chain lightning off the hit, on HUMOURS' exact terms.
export const ALCHEMY_ELEMENTS = [
  { label: 'BURN', status: 'burn', dur: 2.5, power: 1, color: 0xff5a00 },
  { label: 'VENOM', status: 'poison', dur: 3, power: 1, color: 0x39d353 },
  { label: 'ICE', status: 'slow', dur: 2, power: 0, color: 0x7fe3ff },
  { label: 'LIGHTNING', status: 'arc', dur: 0, power: 0, color: 0xffee58 },
  { label: 'FEAR', status: 'fear', dur: 2, power: 0, color: 0x9d4edd },
];
