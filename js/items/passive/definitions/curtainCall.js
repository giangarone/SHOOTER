import { definePassiveItem } from '../shared.js';

// THE LAST BODY OF A WAVE, ALWAYS GENEROUS. Three crates is most of a health
// bar, and it arrives at the one moment in a wave when the player is
// guaranteed to be able to walk to them - the room is empty and the shop has
// not risen yet.
//
// IT IS NOT A DROP ROLL. rollDrop withholds health at a full bar for a good
// reason (a plate that cannot be used is a plate that should not have been
// rolled), and this deliberately ignores that: the wave-clear sweep collects
// whatever is left anyway, and OVERDRAW and the crate's own +25 ceiling both
// have something to do with it.
export const id = 'curtainCall';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'CURTAIN CALL',
    max: 1,
    theme: THEME.curtainCall,
    effects: [['WAVE\'S LAST KILL DROPS', GOOD], ['3 HEALTH CRATES', NOTE]],
    apply: (mods, n) => { mods.curtainCall = 3 * n; },
}));

export const icon = [
  '........................',
  '.22222222222222222222221',
  '.22222222222222222222221',
  '.11222112111111211222111',
  '...2221.21.....21.2221..',
  '...2221.21.....21.2221..',
  '...2221.21.....21.2221..',
  '...2221.21.....21.2221..',
  '...2221.21.442.21.2221..',
  '...2221.21.432.21.2221..',
  '...1121.11.432.11.2111..',
  '.....21....432....21....',
  '.....21....432....21....',
  '.....21.444433442.21....',
  '.....21.433333332.21....',
  '.....11.222332222.11....',
  '...........432..........',
  '...........432..........',
  '...........432..........',
  '...........432..........',
  '...........432..........',
  '...........222..........',
  '........................',
  '........................',
];
