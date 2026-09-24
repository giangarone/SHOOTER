import { definePassiveItem } from '../shared.js';

// ONE PER WAVE, at the moment the player is least able to go and look for a
// crate. It fires on the way DOWN through twenty, so it cannot be farmed by
// hovering there - the bar has to cross the line.
export const id = 'lastBreath';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'LAST BREATH',
    max: 1,
    theme: THEME.lastBreath,
    effects: [['DROP BELOW 20 HP:', NOTE], ['FULL AMMO RESERVE', GOOD], ['ONCE PER WAVE', NOTE]],
    apply: (mods, n) => { mods.lastBreath = 20 * n; },
}));

export const icon = [
  '........................',
  '........................',
  '...........221..........',
  '...........221..........',
  '...........221..........',
  '...........221..........',
  '........222222221.......',
  '........222222221.......',
  '......222222222221......',
  '.....22222222222221.....',
  '....2222222222222221....',
  '...222222223332222221...',
  '...222222223332222221...',
  '...222222223332222221...',
  '...222222223332222221...',
  '...222222223332222221...',
  '...222222223332222221...',
  '...122222212332222211...',
  '....2222221.42222221....',
  '....2222211.21222221....',
  '....211111....111121....',
  '....11............11....',
  '........................',
  '........................',
];
