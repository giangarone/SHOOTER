import { definePassiveItem } from '../shared.js';

// NOTHING IS WASTED ON A CORPSE. A rifle round worth 34 into a body with 5
// left used to throw 29 away; now it walks. Five metres, so it pays a player
// shooting into a crowd and pays nothing at all to one picking off stragglers.
export const id = 'overkill';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'OVERKILL',
    max: 1,
    theme: 0xff7a45,
    effects: [['EXCESS KILL DAMAGE', NOTE], ['CARRIES TO THE NEXT', GOOD], ['ENEMY IT CAN REACH', NOTE]],
    apply: (mods, n) => { mods.overkill = n; mods.overkillRange = 5; },
}));

export const icon = [
  '........................',
  '........................',
  '........................',
  '....................42..',
  '.................24442..',
  '..................4332..',
  '.....2222221.....42222..',
  '....222222221...422.2...',
  '...22222222221.422......',
  '...22022222022422.......',
  '..22000222000322........',
  '..2200002200332.........',
  '..2200022233331.........',
  '..1222222333311.........',
  '...22222333321..........',
  '...12223332211..........',
  '....123332221...........',
  '.....43322221...........',
  '....443222221...........',
  '...4222222221...........',
  '..422.1111111...........',
  '.422....................',
  '422.....................',
  '22......................',
];
