import { definePassiveItem } from '../shared.js';

// ---- THE NINE POSTURE AND MAGAZINE PICKS --------------------------------
//
// What these have in common is that none of them is a number that is simply
// TRUE. Every one asks the player to be doing something particular - to be
// holding a nearly empty magazine, to be reloading a nearly full one, to be
// aiming, to be crouched, to be unhurt - and pays only then. A pool made
// entirely of flat multipliers is a pool where the build is decided at the
// totem and the fight is arithmetic; these are decided in the fight.
export const id = 'fatalReserve';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'FATAL RESERVE',
    max: 1,
    theme: 0xd81b60,
    // THE BOTTOM OF THE MAGAZINE IS THE WORST PART OF IT, always has been: the
    // rounds you fire knowing a reload is coming, usually while backing away.
    // This pays for staying on the trigger through them, and it is the only
    // crit passive item in the pool that is not a probability - the other five
    // change the odds, and this one names five rounds and guarantees them.
    //
    // FIVE OF THIRTY is a sixth of a magazine, so on paper it is worth rather
    // less than DEADEYE's flat +15%. What it is actually worth is that the
    // player knows WHICH five, which no amount of chance can buy: a boss with
    // a sliver left is a reason to burn down to the last five rather than to
    // reload, and that decision is the pick.
    effects: [['LAST 5 ROUNDS OF EVERY', NOTE], ['MAGAZINE ALWAYS CRIT', GOOD]],
    apply: (mods, n) => { mods.fatalReserve = Math.max(mods.fatalReserve, 5 * n); },
}));

export const icon = [
  '........................',
  '.....22222222222221.....',
  '.....22222222222221.....',
  '.....12222222222211.....',
  '......220000000021......',
  '......220000000021......',
  '......220000000021......',
  '......223333333321......',
  '......223333333321......',
  '......220000000021......',
  '......223333333321......',
  '......223333333321......',
  '......220000000021......',
  '......223333333321......',
  '......223333333321......',
  '......220000000021......',
  '......223333333321......',
  '......223333333321......',
  '......220000000021......',
  '......223333333321......',
  '......223333333321......',
  '......222222222221......',
  '......222222222221......',
  '......111111111111......',
];
