import { definePassiveItem } from '../shared.js';

// A MULTIPLE OF THE GUN, NOT A FLAT TWENTY-FIVE. The old number was a real hit
// on wave three and a rounding error on wave thirty, so the one passive item
// in the pool that pays out on the reload got weaker every time the player
// did anything else right. Charged at four times a shot it is worth what the
// build is worth - every damage passive item feeds it - and a ring of eight
// is thirty-two shots' worth of damage spread around the player, which is
// what a vent that costs a reload should be.
export const id = 'reloadBurst';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'RELOAD BURST',
    max: 1,
    theme: THEME.shrapnel,
    effects: [['RELOAD THROWS 8 SHARDS', GOOD], ['4x YOUR DAMAGE', NOTE], ['THEY CANNOT HURT YOU', NOTE]],
    apply: (mods, n) => {
      mods.reloadShards = 8 * n;
      mods.reloadShardMult = 4 * n;
    },
}));

export const icon = [
  '........................',
  '...2.....2..............',
  '.........2..............',
  '....2....2..............',
  '....2....2....2.........',
  '....2...42...22.........',
  '....42..42...2......2...',
  '....42..42..42.....2....',
  '....222.22.422...22.....',
  '.....2.....22...22......',
  '..............422.......',
  '..............22........',
  '..222222221.........222.',
  '..222222221....444222...',
  '..222222221....2222.....',
  '..122222211.............',
  '...2222221..............',
  '...2222221..............',
  '...2222221..............',
  '...2222221..............',
  '...2222221..............',
  '...2222221..............',
  '...1111111..............',
  '........................',
];
