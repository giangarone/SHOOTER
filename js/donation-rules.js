export const DONATION_START_CHANCE = 5;

// Count payouts separately from ownership: grants aren't wins and leaving a
// reward behind doesn't undo the machine's payout.
export function donationLossStep(wins) {
  return Math.max(1, 5 - wins);
}

export function donationChanceAfterLoss(player) {
  return Math.min(100, player.donationChance + donationLossStep(player.donationWins));
}
