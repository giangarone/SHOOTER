import { definePassiveItem } from '../shared.js';

// THE ROUND NOBODY EVER WANTED. The last one in a magazine is the one that
// starts a reload, so it has always been the worst shot in the game to be
// holding; this makes it the best. Three times damage, thrown as a blast at
// wherever it stopped, so it is worth firing into a crowd rather than saved.
//
// A BLAST AND NOT A MULTIPLIER, on BREACH ROUND's terms and for its reason:
// what the player gets back for having run the magazine dry should be worth
// something to the ROOM, not just to whatever one body the round landed on.
//
// IT GOES OFF WHEREVER THE SHOT STOPPED, a wall included. The round was spent
// either way, and a version that only paid on a hit would be a pick that
// punished the miss twice.
export const id = 'pocketGrenade';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'POCKET GRENADE',
    max: 1,
    theme: 0xff5722,
    effects: [['LAST ROUND OF EACH', NOTE], ['MAG: 3x DAMAGE BLAST', GOOD]],
    apply: (mods, n) => { mods.pocketGrenade = 3 * n; mods.pocketRadius = 4; },
}));

export const icon = [
  '........................',
  '.....2222222221.........',
  '.....2222222221.........',
  '.....1222222211.........',
  '......22222221..........',
  '......20000001..........',
  '......20000001..........',
  '......22222221..........',
  '......20000001..........',
  '......20000001..........',
  '......22222221..........',
  '......20000001..........',
  '......20000002..........',
  '......222222222.........',
  '......23332232..........',
  '......22333221..........',
  '......22233221...2......',
  '......112332224422......',
  '........433222222.......',
  '......422233332.........',
  '......22..42232.........',
  '..........42.232........',
  '..........22..222.......',
  '.........22....2........',
];
