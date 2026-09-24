import { definePassiveItem } from '../shared.js';

// THE ONE STATUS IN THE GAME THAT STACKS. Everything else refreshes - see
// the note at the top of status.js - and this is the deliberate exception,
// held to poison alone and to three deep, because poison is the status that
// ticks half as often as fire and is meant to be the patient one. Three
// stacks is fire's rate at three times fire's duration, which is what the
// pick is worth and why it is only ever worth it to a build that poisons.
export const id = 'secondaryInfection';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'SECONDARY INFECTION',
    max: 1,
    theme: THEME.secondaryInfection,
    effects: [['POISON STACKS UP TO 3x', GOOD], ['ON THE SAME ENEMY', NOTE]],
    apply: (mods, n) => { mods.poisonStacks = 1 + 2 * n; },
}));

export const icon = [
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '..................42....',
  '..................42....',
  '..................42....',
  '.................4432...',
  '...........1....443332..',
  '...........21..44333332.',
  '...........21..43333332.',
  '.....1...22221.43333332.',
  '....21...22222243333332.',
  '....221.222222233333332.',
  '...22221122222123333322.',
  '...22221.222211.222222..',
  '...22211.11111..........',
  '...1111.................',
  '........................',
  '........................',
  '........................',
  '........................',
];
