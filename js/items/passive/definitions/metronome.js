import { definePassiveItem } from '../shared.js';

// THE GUN JOINS THE BAND. The trigger stops being a rate at all: a shot
// leaves on the beat and on no other frame, which means the fire rate stat
// has nothing left to multiply and the player's own timing has nothing left
// to do. What they get for it is a round worth four.
//
// Fire, poison and every sentry gun in the arena already ride Music.pulse
// (see the note in js/music.js); this is the player joining them.
export const id = 'metronome';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'METRONOME',
    max: 1,
    theme: 0xff6e40,
    effects: [['SHOTS FIRE ON THE', NOTE], ['BEAT ONLY: 4x DAMAGE', GOOD], ['FIRE RATE MEANS NOTHING', BAD]],
    apply: (mods, n) => {
      mods.metronome = n;
      mods.damage *= Math.pow(4, n);
    },
}));

export const icon = [
  '........................',
  '........................',
  '.........222221.........',
  '.........200001..2......',
  '........2200002242......',
  '........2200002232......',
  '........2200002222......',
  '........200000032.......',
  '.......220000003342.....',
  '.......220000003332.....',
  '.......220000003222.....',
  '.......2000000331.......',
  '......220000003321......',
  '......220000003021......',
  '......200000033001......',
  '.....22000000330021.....',
  '.....22000000300021.....',
  '.....22000003300021.....',
  '.....20000003300001.....',
  '....2200000220000021....',
  '....2200002222000021....',
  '....1111111211111111....',
  '...........11...........',
  '........................',
];
