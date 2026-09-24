import { definePassiveItem } from '../shared.js';

// ONE HEAL, AND IT IS THIS ONE. A point a second during combat, and every other
// source in the game - crates, Vampiric, Blood Pact, the item pool's four
// heals, the leech - does nothing at all. It is the strongest slow heal there
// is and it makes the entire health economy stop applying to you.
export const id = 'healthyCore';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'HEALTHY CORE',
    max: 1,
    theme: 0x1b998b,
    effects: [['REGEN 1 HP/s', GOOD], ['IN COMBAT ONLY', NOTE], ['ALL OTHER HEALING OFF', BAD]],
    apply: (mods, n) => { mods.coreRegen = 1 * n; mods.healBlock = n; },
}));

export const icon = [
  '........................',
  '........................',
  '........22222221........',
  '......222111112221......',
  '.....22111....11221.....',
  '....2111...00...1121....',
  '...221..00043200..221...',
  '...211.00..432.00.121...',
  '..221.00...432..00.221..',
  '..211.0....432...0.121..',
  '..21..0....432...0..21..',
  '..21.04444443344442.21..',
  '..21.03333333333332.21..',
  '..21..2222233222222.21..',
  '..221.0....432...0.221..',
  '..121.00...432..00.211..',
  '...221.00..432.00.221...',
  '...121..00043200..211...',
  '....1221...222..2211....',
  '.....12221....22211.....',
  '......112222222111......',
  '........11111111........',
  '........................',
  '........................',
];
