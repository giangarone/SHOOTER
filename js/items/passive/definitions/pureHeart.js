import { definePassiveItem } from '../shared.js';

// THE CLEAN BAR AS A WEAPON. No plate, no battery, no magnet, no buff - the
// floor holds nothing but money, which the run already owns forty other
// ways. What that buys is twenty per cent off everything on the gun and
// twenty more points of bar, and the catch is that the only way back to
// health, ammunition and charge is the shop and the streak: the drop
// system's whole safety net - the need curve, the relief spawner, the boss
// bleed, the wave's own crates - is switched off at the source.
//
// ORBS ARE NOT PICKUPS. Money is the economy, not the recovery, and a pick
// that stopped the floor paying out would be a different and crueller game
// than the one this card describes.
export const id = 'pureHeart';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'PURE OF HEART',
    max: 1,
    theme: 0xa5d6ff,
    effects: [
      ['NO PICKUPS EVER DROP', BAD],
      ['+20% DAMAGE', GOOD],
      ['+20 MAX HP', GOOD],
    ],
    apply: (mods, n) => {
      mods.noPickups = n;
      mods.damage *= 1 + 0.2 * n;
      mods.maxHpBonus += 20 * n;
    },
}));

// THE CRYSTAL HEART. Cut, not grown: facet lines, one bloom of light held
// off-centre, nothing on the floor that could feed it.
export const icon = [
  '........................',
  '........................',
  '........................',
  '.................3......',
  '................343.....',
  '.......4221..2221.......',
  '......42222.22221.......',
  '.....4222211222221......',
  '....422222222222221.....',
  '....422122221122121.....',
  '....422143221221121.....',
  '....422234222222221.....',
  '....422232222222221.....',
  '.....2222212122221......',
  '......22222222221.......',
  '.......222222221........',
  '........2222221.........',
  '.........22221..........',
  '..........221...........',
  '...........1............',
  '........................',
  '........................',
  '........................',
  '........................',
];
