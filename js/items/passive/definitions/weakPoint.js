import { definePassiveItem } from '../shared.js';

// TELLTALE'S PATIENT COUSIN. That one turns the third hit on a body into a
// crit; this one turns the body itself into a soft target, permanently, for
// everything - the gun, a turret, poison, a blast, another enemy's friendly
// fire. Three hits is one burst.
export const id = 'weakPoint';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'WEAK POINT',
    max: 1,
    theme: 0xff4fa3,
    effects: [
      ['3 HITS ON AN ENEMY', GOOD],
      ['MARK IT: +50% DMG TAKEN', NOTE],
      ['FROM ALL SOURCES', NOTE],
    ],
    apply: (mods, n) => { mods.markHits = 3; mods.markBonus = 0.5 * n; },
}));

// THE BREACH. Three impacts cratered into a dark plate, hairline cracks
// running from each one into the glowing wound they opened together - the
// body itself, marked soft for everything after.
export const icon = [
  '........................',
  '........................',
  '........................',
  '...444444442222222221...',
  '...422222222222222221...',
  '...442222222222222231...',
  '...422442222224422221...',
  '...422401222222401221...',
  '...422211222222211221...',
  '...222222022220222221...',
  '...222222203302222221...',
  '...222222334433222221...',
  '...222223344443322221...',
  '...222222334332222221...',
  '...222222223322222221...',
  '...222222220222222221...',
  '...222222244222222221...',
  '...222222240122222221...',
  '...222222221122222211...',
  '...111111111111111111...',
  '....1111111111111111....',
  '........................',
  '........................',
  '........................',
];
