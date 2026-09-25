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

export default definePassiveItem(({ GOOD, BAD, NOTE }) => ({
    name: 'CHORUS',
    max: 1,
    theme: 0xff8ad0,
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

// THREE VOICES, FIRED. One muzzle, three rounds: the note straight down
// the middle and its two detuned copies climbing and diving away from it.
export const icon = [
  '........................',
  '........................',
  '........................',
  '........................',
  '...................4....',
  '.................14.....',
  '...............333......',
  '............4333........',
  '.........4333...........',
  '........333.........4...',
  '..4221.33...............',
  '..400144444433333444....',
  '..42212222223333311.....',
  '..4001.33...............',
  '..4221..333.........4...',
  '.........1333...........',
  '............1333........',
  '...............333......',
  '.................41.....',
  '...................1....',
  '........................',
  '........................',
  '........................',
  '........................',
];
