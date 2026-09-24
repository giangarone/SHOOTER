import { definePassiveItem } from '../shared.js';

// THE PICK THAT FEEDS ON THE CROWD. Two percent per body alive, capped at
// forty - which is TWENTY bodies, a number only the middle of a wave ever
// holds. The shape is the whole point: the gun is fastest when the room is
// worst, and the emptier the arena gets the closer to base it falls, so the
// pick pays the player for the exact half of the wave nobody enjoys.
//
// LIVE, NOT A RAMP. The count is read every trigger pull off the frame's own
// mirror of the roster (see aliveCount), so a wave clearing mid-magazine
// slows the gun down frame by frame - the pack thinning is something the
// player can hear.
export const id = 'wolfPack';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'WOLF PACK',
    max: 1,
    theme: 0x8a9199,
    effects: [['+2% FIRE RATE', GOOD], ['PER ENEMY ALIVE, MAX 40%', NOTE]],
    apply: (mods, n) => { mods.wolfPack = 0.02 * n; mods.wolfPackCap = 0.4; },
}));

// THE PACK AS ONE HEAD. Ears up, the glare slanted in under a dark brow, and
// the long muzzle carried light down to the nose - the room the pick counts,
// given a face. The nose and the notch between the ears are the only pixels
// at outline-dark.
export const icon = [
  '........................',
  '........................',
  '........................',
  '.....32..........31.....',
  '....3222........3221....',
  '....32221......32221....',
  '....32221.2222.32221....',
  '....3333333332222221....',
  '...32221112332111221....',
  '...32243222332223321....',
  '...32222322332232221....',
  '..3222222233332222221...',
  '..3222222233332222211...',
  '..3222222233332222211...',
  '...32222233333322211....',
  '....322223333332211.....',
  '.....2222333333211......',
  '.....2222333333111......',
  '........33000021........',
  '.........300001.........',
  '..........1111..........',
  '........................',
  '........................',
  '........................',
];
