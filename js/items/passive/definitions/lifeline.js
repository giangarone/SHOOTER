import { definePassiveItem } from '../shared.js';

// A FLOOR UNDER THE BAR. It regenerates only up to 25 and then stops, so it
// is not a heal - it is a promise that the bottom of the bar refills itself,
// fast, and that the player can spend it. Nothing else in the pool makes
// being nearly dead a place you can stay.
export const id = 'lifeline';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'LIFELINE',
    max: 1,
    theme: THEME.lifeline,
    effects: [['AT 25 HP OR BELOW:', NOTE], ['REGEN 5 HP/s', GOOD]],

    apply: (mods, n) => { mods.lifelineAt = 25; mods.lifelineRate = 5 * n; },
}));

export const icon = [
  '........................',
  '........................',
  '.........2..............',
  '........442.............',
  '........432.............',
  '........432.............',
  '........432.............',
  '.......4222.............',
  '.......42.42..42........',
  '.......42.42..42........',
  '.......22.42.4432.......',
  '......42..42.4222.......',
  '44444442..22.42.44444442',
  '22222222...4422.22222222',
  '...........432..........',
  '...........432..........',
  '...........422..........',
  '...........22...........',
  '........................',
  '........................',
  '.22222222222222222222221',
  '.22222222222222222222221',
  '.11111111111111111111111',
  '........................',
];
