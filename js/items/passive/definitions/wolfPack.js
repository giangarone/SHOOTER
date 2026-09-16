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

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'WOLF PACK',
    max: 1,
    theme: THEME.wolfPack,
    effects: [['+2% FIRE RATE', GOOD], ['PER ENEMY ALIVE, MAX 40%', NOTE]],
    apply: (mods, n) => { mods.wolfPack = 0.02 * n; mods.wolfPackCap = 0.4; },
}));

// THREE HEADS RUNNING ONE WAY. The pack, drawn small and angled - heads
// forward, ears back, the silhouette of several bodies moving as one.
export const icon = [
  '........................',
  '........................',
  '....222.......222.......',
  '...2222......2222.......',
  '..22222.....22222.......',
  '..222232....2222232.....',
  '..2232222..22232222.....',
  '..22332222.22332222.....',
  '..23332222223332222.....',
  '..2332222223332222......',
  '..2332222223322222......',
  '...22222223322222.......',
  '....2222333222222.......',
  '.....2333222222.........',
  '....3333222222..........',
  '...3333222222...........',
  '..33332222222...........',
  '..33322222222...........',
  '..33222222222...........',
  '..3222222222............',
  '...222222222............',
  '....2222222.............',
  '........................',
  '........................',
];
