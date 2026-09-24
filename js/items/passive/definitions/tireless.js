import { definePassiveItem } from '../shared.js';

// THE BAR NEVER EMPTIES. Second Wind buys the rhythm back faster; this
// deletes the rhythm, so sprinting and sliding stop being resources and
// become the way the player moves.
export const id = 'tireless';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'TIRELESS',
    max: 1,
    theme: 0x40c4ff,
    effects: [['UNLIMITED STAMINA', GOOD]],
    apply: (mods, n) => { mods.staminaDrain *= Math.pow(0, n); },
}));

export const icon = [
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '.....44442....44442.....',
  '...444223344444223342...',
  '..44222.22333222.22332..',
  '..422.....2322.....232..',
  '.442.......42.......432.',
  '.432......4432......432.',
  '.432......2322......432.',
  '.232.......42.......422.',
  '..432.....4432.....442..',
  '..23342.44433342.44422..',
  '...223344222223344222...',
  '.....22222....22222.....',
  '........................',
  '........................',
  '.22222222222222222222221',
  '.22222222222222222222221',
  '.11111111111111111111111',
  '........................',
];
