import { definePassiveItem } from '../shared.js';

// ---- THE THIRD POOL ------------------------------------------------------
//
// Twenty-seven more max-1 picks, on the contract the two blocks above hold:
// zero is "not owned" and every reader tests for it. What they have in common
// as a GROUP is that most of them are questions about a thing the player is
// DOING or a thing the run has ACCUMULATED - how high they are standing, how
// much stamina is left, how many boxes they have bought, how long the boss
// fight has run - rather than a flat number folded into the stat block. The
// counters those questions need live on the Player (see reset()); only the
// settings are here, where rebuildMods can replay them.

// ---- the gun, and the moments it is better ------------------------------

// THE ONE PICK THAT MAKES THE BUTT OF THE RIFLE A WEAPON. Melee is already
// worth double at the kill (MELEE_KILL_MULT) and reaches four metres; four
// times the damage is what turns "the thing you do when something is on top
// of you" into a thing you walk toward something to do.
//
// THE TEN ROUNDS ARE WHAT PAY FOR THE WALK. They land on a HIT and not on a
// kill - the swing that connected is the one that cost the player the
// distance, and a swing that finished something off would pay a build that
// was already winning. It is deliberately the same shape SCAVENGER has and
// deliberately bigger per event, because a swing is one event every 0.6s and
// a kill is whatever the wave is handing out.
export const id = 'crowbar';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'CROWBAR',
    max: 1,
    theme: 0x9e7b4f,
    effects: [['MELEE: 4x DAMAGE', GOOD], ['AND +10 AMMO PER HIT', GOOD]],
    apply: (mods, n) => { mods.crowbar = 4 * n; mods.crowbarAmmo = 10 * n; },
}));

export const icon = [
  '........................',
  '........................',
  '...............4...4....',
  '..................4.22..',
  '.................2.2.1..',
  '................4.4.1.4.',
  '...............42411....',
  '..............42211.....',
  '.............4421.......',
  '.............4211.......',
  '............4221........',
  '...........4421.........',
  '..........43211.........',
  '..........3211..........',
  '.........4221...........',
  '........4211............',
  '.......4411.............',
  '...4...4211.............',
  '......4221..............',
  '....44221...............',
  '....1221................',
  '.....1..................',
  '........................',
  '........................',
];
