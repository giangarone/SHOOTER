import { definePassiveItem } from '../shared.js';

// WHAT IS STILL ON THE FLOOR WHEN THE WAVE ENDS, IN ROUNDS. The sweep pays
// the credits as it always did; this is paid on top of them, per orb, which
// makes the pick a reason to STAY IN THE FIGHT rather than to break off and
// tidy up after every kill.
//
// THE EXPLOIT IT IS PRICED AGAINST: hoard the floor, collect nothing, cash
// in at the clear. It does not work, and the reason is ORB_LIFETIME - an orb
// left for more than twenty seconds is gone, money and all, so a player
// hoarding deliberately is burning credits for rounds at a rate nobody would
// take. What is left at a clear is the orbs from the last twenty seconds of
// the fight, which is what the pick is actually paying for.
//
// The reserve's own ceiling is the cap; there is no second one.
export const id = 'movingDay';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'MOVING DAY',
    max: 1,
    theme: 0xc9a227,
    effects: [['AT WAVE END:', NOTE], ['FLOOR ORBS BECOME', NOTE], ['5 AMMO EACH', GOOD]],
    apply: (mods, n) => { mods.movingDay = 5 * n; },
}));

// WHAT THE WAVE LEAVES. A flagged ammo carton with its bullet mark, lift
// arrows underneath, and the floor's leftover orbs rising to meet it -
// five rounds each for staying in the fight.
export const icon = [
  '........................',
  '...........22...........',
  '...........22333........',
  '...........223333.......',
  '...........22333........',
  '.........433333.........',
  '........42233221........',
  '........42233221........',
  '........21111111........',
  '........................',
  '.....343................',
  '......3..........3......',
  '......3..........3......',
  '......3..........3......',
  '........................',
  '....343...343....343....',
  '....333...333....331....',
  '....111...111....111....',
  '..11111111111111111111..',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
];
