import { definePassiveItem } from '../shared.js';

// PERMANENT MAX HP, on the same flawless flag No-Hit Bonus reads. The two
// are deliberately different rewards for one piece of play: that one makes
// the gun better and can be lost by a single hit, this one banks something
// no later wave can take back. Capped so a long clean run cannot simply
// outgrow the arena - twenty flawless waves is the target.
export const id = 'untouched';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'UNTOUCHED',
    max: 1,
    theme: 0xb2ff59,
    effects: [['CLEAR A WAVE WITHOUT', NOTE], ['BEING HIT: +3 MAX HP', GOOD], ['PERMANENT, UP TO +60', NOTE]],
    apply: (mods, n) => {
      mods.hpPerCleanWave = 3 * n;
      mods.hpBankCap = Math.max(mods.hpBankCap, 60 * n);
    },
}));

// THE FLAWLESS AEGIS. A mirror-bright shield that has never been scratched:
// energy trim, a shine streak down the face, a heart that has never bled,
// and sparkles it never had to earn.
export const icon = [
  '........................',
  '........................',
  '.......4444222222.......',
  '....3..4222222221.......',
  '...343.4322222231.......',
  '....3..4342222231.......',
  '.......4333223331..3....',
  '.......4343333331.343...',
  '.......2333333331..3....',
  '.......2323333231.......',
  '.......2322332231.......',
  '.......2322222231.......',
  '........23222231........',
  '........22222221........',
  '.........222221.........',
  '.........222221.........',
  '..........2221..........',
  '..........2221..........',
  '...........21...........',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
];
