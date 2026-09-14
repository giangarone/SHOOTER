import { definePassiveItem } from '../shared.js';

// ---- movement, and what a jump is worth ---------------------------------

// HOLD THE BUTTON AND GO UP. It is LEAD BALLOON's exact opposite and DOUBLE
// JUMP's other half: that pick gives a second arc and this gives the first
// one no ceiling but the room's own, for as long as the bar lasts.
//
// IT CLIMBS RATHER THAN GLIDING, and the difference is the whole pick. A
// glide is something that happens on the way down from a jump already taken
// - it changes how a fall ends. This changes where the fight is: the venue is
// sixteen metres tall and had nothing in the top twelve of them, and a run
// carrying this can put itself there.
//
// NOT PARTY BALLOONS' MACHINERY, and deliberately. That item lifts an ENEMY
// off the floor and holds it there helpless - a scripted removal with a
// ground snap at the end of it - where this is a verb the player holds down
// and steers with. The one is a state on a body; the other is a term in the
// gravity line (see Player.update), which is the only place a climb can
// compose correctly with a dash, a jump and the lid at the same time.
//
// THE EXPLOIT IT IS PRICED AGAINST: climb to the ceiling, sit there out of
// reach of everything that walks, and shoot down. The numbers are set so
// that it cannot be reached at all. A full bar is 100 and the drain is 68, so
// the whole bar is under a second and a half of climb - about nine metres at
// 6 m/s, against a lid the player's head meets at fourteen. One bar does not
// get you to the roof; it gets you over the crowd and onto the high ground,
// which is what the pick is for. The lockout then refuses the next sprint as
// well, which is the same bill a run to empty has always paid.
//
// What it DOES pay for is a route: over the crowd, onto a catwalk, off the
// far side. TIGHTROPE is the pick that notices - the two are meant to be
// found together.
export const id = 'updraft';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'UPDRAFT',
    max: 1,
    theme: THEME.updraft,
    effects: [['HOLD JUMP TO FLY UP', GOOD], ['DRAINS STAMINA', BAD]],
    apply: (mods, n) => {
      mods.float = n;
      mods.floatDrain = 68;
      mods.floatRise = 6;
      // Against the 22 m/s^2 in Player.update, which is applied first - so the
      // net climb is 40 and a fall is turned round in about a third of a
      // second. See the note at the float branch there.
      mods.floatLift = 62;
    },
}));
