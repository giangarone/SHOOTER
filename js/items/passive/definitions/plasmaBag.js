import { definePassiveItem } from '../shared.js';

// THE CRATE, WORTH SOMETHING ON A FULL BAR. A health plate is withheld
// outright at full health (see rollDrop) precisely because it would be a drop
// that cannot be used; this is the pick that makes the ten points a crate
// carries worth having whatever the bar is at, because a shield point does
// not have a ceiling to hit.
//
// ON TOP OF THE HEAL RATHER THAN INSTEAD OF IT. It is the smallest number in
// the shield family by a distance, and it has to be: a crate is a thing the
// player walks over several times a wave, where BALLAST TANKS is once and
// SECOND SKIN costs a full item charge.
export const id = 'plasmaBag';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'PLASMA BAG',
    max: 1,
    theme: 0x5fd6c2,
    effects: [['HEALTH CRATES ALSO', NOTE], ['GIVE A 10 SHIELD', GOOD]],
    apply: (mods, n) => { mods.crateShield = 10 * n; },
}));

export const icon = [
  '........................',
  '...........21...........',
  '.........222221.........',
  '........22222221........',
  '......222220022221......',
  '....2222200000022221....',
  '..22222000000000022221..',
  '..22220000033300002221..',
  '..22200000033300000221..',
  '..22200000033300000221..',
  '..22200000033300000221..',
  '..22200333333333330221..',
  '..22200333333333330221..',
  '..22200333333333330221..',
  '..22200000033300000221..',
  '..22200000033300000221..',
  '..22220000033300002221..',
  '..11222000033300022111..',
  '....1122200000022111....',
  '......112220022111......',
  '........12222211........',
  '.........112111.........',
  '...........11...........',
  '........................',
];
