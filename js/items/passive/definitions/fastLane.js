import { definePassiveItem } from '../shared.js';

// THE SPRINT, WIDER. Every movement pick in the pool either changes the whole
// stack (moveMult) or takes a verb away (LEAD BALLOON); this widens ONE GEAR,
// which is the second gear's whole identity - the walk is the game's baseline
// and the run is the thing that costs, so paying for the run faster is paying
// for what the stamina bar was already buying.
//
// Thirty on a 1.5x sprint takes the top speed from 15 to 19.5 m/s, between
// the ordinary sprint and the dash - fast enough to feel like a different
// gear, nowhere near enough to leave the room behind.
export const id = 'fastLane';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'FAST LANE',
    max: 1,
    theme: 0x29b6f6,
    effects: [['SPRINT +30% SPEED', GOOD]],
    apply: (mods, n) => { mods.fastLane = 0.3 * n; },
}));

// A BOOT WITH A WING, GOING FASTER. The sneaker mid-stride, three feathers
// on its heel, and the speed lines it is outrunning.
export const icon = [
  '........................',
  '........................',
  '........................',
  '........................',
  '..422221................',
  '...11111................',
  '..422221................',
  '...11111................',
  '..422221................',
  '...11111400.............',
  '........420.............',
  '..4111..422042..........',
  '........42220222221.....',
  '..4111..42222222221.....',
  '........44333333311.....',
  '..4111..42222222221.....',
  '.......422222222222.....',
  '.......111111111111.....',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
];
