import { definePassiveItem } from '../shared.js';

// =========================================================================
// RANGE, WHICH THE GAME HAD NEVER CHARGED FOR
// =========================================================================
//
// Damage has never cared how far away the thing was. These two make it care,
// in opposite directions, and they are a matched pair on purpose: whichever
// one a run draws, it is being told to stand somewhere.
export const id = 'longshot';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'LONGSHOT',
    max: 1,
    theme: 0x0288d1,
    // A RAMP, NOT A THRESHOLD. A flat "+30% past 20 metres" would be a cliff
    // the player cannot see, and the tell would be the damage number jumping
    // as they backed over an invisible line. It climbs the whole way instead -
    // nothing at the muzzle, the full thirty at LONGSHOT_RANGE - so the
    // feedback is continuous and a player who has never read the card still
    // learns that backing off pays.
    effects: [['UP TO +30% DAMAGE,', GOOD], ['FURTHER = MORE', NOTE]],
    apply: (mods, n) => { mods.longshot = 0.3 * n; },
}));

export const icon = [
  '............442.........',
  '...........243342.......',
  '............2333342.....',
  '.............22333342...',
  '...............22333342.',
  '.................4333332',
  '.................4333322',
  '...............44433222.',
  '......221....44433222...',
  '......12221.4433222.....',
  '.......1122443222.......',
  '.........112332.........',
  '...........2221.........',
  '.........222111.........',
  '.......222111...........',
  '......22111.............',
  '.11...111...............',
  '.1111...................',
  '..11111.................',
  '....111.................',
  '..11111.................',
  '.1111...................',
  '.11.....................',
  '........................',
];
