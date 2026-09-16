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

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'FAST LANE',
    max: 1,
    theme: THEME.fastLane,
    effects: [['SPRINT +30% SPEED', GOOD]],
    apply: (mods, n) => { mods.fastLane = 0.3 * n; },
}));

// A ROAD WITH ARROWS. Three lane arrows running away to the right, the one
// shape that means "faster, here".
export const icon = [
  '........................',
  '........................',
  '........................',
  '..................333...',
  '................3333....',
  '...............43333....',
  '......33......433333....',
  '.....3333....43333......',
  '....43333...43333.......',
  '....433333433333........',
  '....43333333333.........',
  '....43333343333.........',
  '....43333...43333.......',
  '.....3333....433333.....',
  '......33......4333......',
  '..............43333.....',
  '...............33333....',
  '................33333...',
  '..................333...',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
];
