import { definePassiveItem } from '../shared.js';

// ---- THE FOURTH POOL -----------------------------------------------------
//
// Twenty-seven more max-1 picks on the contract the three blocks above hold:
// zero is "not owned" and every reader tests for it. What they have in common
// as a GROUP is that most of them hang off a clock the player does not own -
// the beat, the wave boundary, a reload seating, a crate being walked over,
// a turret's own shot - rather than off the trigger. That is deliberate and
// it is the reason the block exists: three pools of picks that all paid on a
// trigger pull had made the shot the only event in the game worth building
// around, and a run that is rewarded for the fight CONTINUING plays
// differently from one rewarded for firing faster.
//
// The exception, and it is worth naming: ODD COUPLE and EVEN BETTER are
// trigger picks, and they read `magAtShot` - what the TRIGGER saw - exactly
// as FATAL RESERVE and HARM WANDS do, never the live count.

// ---- the music, which nothing in the pool had ever paid for --------------

// A SECOND GUN THAT IS NOT A GUN. Once a whole beat, one body in the room
// takes a flat ten points of damage - the same shape HEARTBEAT pays in, so
// the beat buys the same thing whatever the run has drafted. It used to pay
// one of the player's own shots, and that was the wrong half to scale: a
// damage build got the pick twice over, once per
// trigger pull and once per beat it happened to be alive for.
//
// ON THE WHOLE BEAT AND NOT THE HALF. The sentries fire twice a beat and the
// burn ticks on the upbeat; a third thing landing on every pulse would have
// made the beat a wall of numbers rather than a rhythm. Once a beat is a
// thing the player can HEAR arriving, which is the whole point of hanging it
// on the music at all.
//
// RANDOM, AND THAT IS THE PRICE. It cannot be aimed at the thing that needs
// killing, so it is worth most in a crowd and least in the fight the player
// actually cares about - which is the opposite shape to every damage pick
// above it and is why it can be this large.
export const id = 'syncopation';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'SYNCOPATION',
    max: 1,
    theme: THEME.syncopation,
    effects: [['ONCE A BEAT:', NOTE], ['10 DAMAGE TO A', GOOD], ['RANDOM ENEMY', NOTE]],
    apply: (mods, n) => { mods.syncopation = 1 * n; mods.syncopationHit = 10; },
}));
