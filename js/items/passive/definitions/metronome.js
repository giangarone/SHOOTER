import { definePassiveItem } from '../shared.js';

// THE GUN JOINS THE BAND. The trigger stops being a rate at all: a shot
// leaves on the beat and on no other frame, which means the fire rate stat
// has nothing left to multiply and the player's own timing has nothing left
// to do. What they get for it is a round worth four.
//
// Fire, poison and every sentry gun in the arena already ride Music.pulse
// (see the note in js/music.js); this is the player joining them.
export const id = 'metronome';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'METRONOME',
    max: 1,
    theme: THEME.metronome,
    effects: [['SHOTS FIRE ON THE', NOTE], ['BEAT ONLY: 4x DAMAGE', GOOD], ['FIRE RATE MEANS NOTHING', BAD]],
    apply: (mods, n) => {
      mods.metronome = n;
      mods.damage *= Math.pow(4, n);
    },
}));
