import { definePassiveItem } from '../shared.js';

// A MULTIPLE OF THE GUN, NOT A FLAT TWENTY-FIVE. The old number was the same
// mistake fire and poison were built out of (see Player.dotHit): a real hit
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
