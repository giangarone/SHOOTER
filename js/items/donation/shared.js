// Donation rewards are permanent, one-copy build items. They use the passive
// item's effect vocabulary and modifier replay, but live in catalogues of
// their own so neither the totem nor active-item pools can ever roll them.
import { THEME, GOOD, BAD, NOTE } from '../passive/shared.js';

export { THEME, GOOD, BAD, NOTE };

const CONTEXT = Object.freeze({ THEME, GOOD, BAD, NOTE });

export function defineDonationItem(build) {
  return build(CONTEXT);
}
