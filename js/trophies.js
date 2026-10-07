// Win-streak trophies. The shelf on the main menu and the unlock callout on
// the win screen both read this - one table, so the menu can never promise a
// tier the win screen does not award.
//
// A trophy is PERMANENT: tiers are measured against the best streak ever
// (`va-best-streak`), not the live one, so ending a run can never re-lock
// what was already earned. Colours stay in recognisable metal families.
export const TROPHIES = [
  { icon: 'trophyBronze', name: 'BRONZE', need: 1, theme: 0xb07030 },
  { icon: 'trophySilver', name: 'SILVER', need: 3, theme: 0xc0c8d4 },
  { icon: 'trophyGold', name: 'GOLD', need: 5, theme: 0xffc93a },
  { icon: 'trophyDiamond', name: 'DIAMOND', need: 10, theme: 0x9dfbff },
];

// How many tiers a best streak of `n` has earned. A free function and not a
// method because the win screen and the menu shelf both need it without a
// game instance - see ui.js.
export function trophiesEarned(best) {
  let n = 0;
  for (const t of TROPHIES) if (best >= t.need) n++;
  return n;
}
