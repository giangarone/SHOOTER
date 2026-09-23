import { definePassiveItem } from '../shared.js';

// THE DETUNE. A chorus effect is one note played three times, each copy a
// hair off the others' pitch, so the whole thing shimmers. Here the note is
// the trigger pull: two extra pellets ride every shot, each worth sixty
// percent of the round it shadows. The extras are drawn from the same cone
// the main shot is, and that cone is a shade wider while the pick is owned -
// three rounds can never leave one barrel as one line, and the card says so.
//
// THE EXTRAS ARE PELLETS, NOT VOLLEYS. They share the press's crit roll,
// its dmgMult and its dedup sets, exactly as TWENTY/TWENTY's second pattern
// does, and they cost no ammunition of their own: what the pick sells is
// more lead per round, not more rounds per magazine.
export const id = 'chorus';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE }) => ({
    name: 'CHORUS',
    max: 1,
    theme: THEME.chorus,
    effects: [
      ['+2 PROJECTILES PER SHOT', GOOD],
      ['EACH AT -40% DMG', NOTE],
      ['SLIGHT SPREAD INCREASE', BAD],
    ],
    apply: (mods, n) => {
      mods.chorus = 2 * n;
      mods.chorusDamage = 0.6;
      // Hair Trigger's own flat penalty is 0.016; this is a shade under it,
      // because the whole cone pays this one and the card only promises a
      // slight increase.
      mods.spreadAdd += 0.012 * n;
    },
}));

// THREE VOICES. Three sines, one per row, each phase-shifted against its
// neighbours - the middle one pale, the original note the two energy copies
// are detuned around.
export const icon = [
  '........................',
  '........................',
  '........................',
  '..............33333.....',
  '.............3.....33...',
  '..3........33........3..',
  '...33.....3.............',
  '.....33333..............',
  '........................',
  '........................',
  '...........44444........',
  '..........4.....44......',
  '........44........4.....',
  '.......4...........44...',
  '..44444..............4..',
  '........................',
  '........................',
  '........33333...........',
  '......33.....3..........',
  '.....3........33........',
  '...33...........3.......',
  '..3..............33333..',
  '........................',
  '........................',
];
