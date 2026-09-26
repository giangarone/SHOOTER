export const DONATION_START_CHANCE = 5;
export const DONATION_COST_TIERS = Object.freeze([
  { health: 25, credits: 1000, ammo: 60 },
  { health: 30, credits: 1500, ammo: 90 },
  { health: 35, credits: 2000, ammo: 120 },
  { health: 40, credits: 2500, ammo: 150 },
].map(Object.freeze));

// Count payouts separately from ownership: grants aren't wins and leaving a
// reward behind doesn't undo the machine's payout.
export function donationLossStep(wins) {
  return Math.max(1, 5 - wins);
}

export function donationChanceAfterLoss(player) {
  return Math.min(100, player.donationChance + donationLossStep(player.donationWins));
}
