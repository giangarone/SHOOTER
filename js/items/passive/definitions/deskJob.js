import { definePassiveItem } from '../shared.js';

// ---- THE FIFTH POOL ------------------------------------------------------
//
// Five more max-1 picks, and what holds them together is that each one
// answers a question about the player rather than about the gun: where they
// are standing (a desk), what they are carrying (nothing but a clean bar),
// how badly the run is going (nearly over), who just touched them, what they
// are holding in the other hand. Four of the five take something the player
// already owns and change what it is WORTH, which is the trade the whole
// pool runs on.

// A CHAIR, IN EXCHANGE FOR THE LEGS. LEAD BALLOON takes the jump and
// SURGICAL STAKES take the slide; the sprint is the one verb left whose
// absence changes how every room in the game is crossed, and this is the
// pick that takes it. +20% damage and -20% taken is a life for a life: the
// build hits harder and survives more of what comes back, and pays for both
// with the only thing in the game that gets you out of the way entirely.
//
// THE SLIDE GOES WITH IT, because a slide is entered out of a sprint - the
// refusal sits at the one gate every run passes through, so there is no
// earlier state left to slide out of. The dash and the jump keep working,
// on LEAD BALLOON's terms: taking the run is meant to change how the room
// is crossed, not to nail the player to the floor.
export const id = 'deskJob';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'DESK JOB',
    max: 1,
    theme: 0x996242,
    effects: [['+20% DAMAGE', GOOD], ['TAKE 20% LESS DAMAGE', GOOD], ['SPRINT DISABLED', BAD]],
    apply: (mods, n) => {
      mods.damage *= 1 + 0.2 * n;
      mods.damageTakenMult *= Math.pow(0.8, n);
      mods.noSprint = n;
    },
}));

export const icon = [
  '........................',
  '........................',
  '....22222222222222221...',
  '....22222222222222221...',
  '....22222222222222221...',
  '....22000000000000021...',
  '....22000000000000021...',
  '....22000000000000021...',
  '....22000000000000021...',
  '....22222222222222221...',
  '....11112222222211111...',
  '........222222221.......',
  '........233333331.......',
  '........233333331.......',
  '........233333321.......',
  '.......2211111221.......',
  '.......221....221.......',
  '.......221....221.......',
  '.......221....221.......',
  '.......221....221.......',
  '.......221....221.......',
  '.......1112221111.......',
  '........1.1111.1........',
  '........................',
];
