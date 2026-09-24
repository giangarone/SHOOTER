import { definePassiveItem } from '../shared.js';

export const id = 'noHitBonus';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'NO-HIT BONUS',
    max: 1,
    theme: 0xeaff6b,
    // The only PERMANENT growth in the pool, and the only reward for a skill
    // the game already measured and only ever paid in credits. It stacks for
    // the rest of the run, so a player who keeps clearing waves clean is
    // building - and a single hit anywhere in a wave costs them that wave's
    // stack, which is what makes it worth playing around.
    //
    // Capped, and additively rather than compounding. Uncapped compounding was
    // the one line in the pool with no ceiling: a player who was already good
    // enough not to be touched kept multiplying, so by wave 30 it was worth
    // more than the rest of the build put together. Five clean waves for a
    // flat +40% is still the best rare in the pool and is now a target the
    // player can actually finish.
    effects: [['CLEAR A WAVE WITHOUT', NOTE], ['BEING HIT: +8% DMG', GOOD], ['AND RATE, MAX +40%', GOOD]],
    apply: (mods, n) => { mods.noHitBonus = 0.08 * n; },
}));

export const icon = [
  '........................',
  '........221...221.......',
  '........221...221.......',
  '........221...221.......',
  '........221...221.......',
  '........221...221.......',
  '........211111121.......',
  '.......1111221111.......',
  '......112222222211......',
  '.....11222233222211.....',
  '.....12222233222221.....',
  '....1122222332222211....',
  '....1123333333333211....',
  '....1222333333332221....',
  '....1222233333322221....',
  '....1122233333322211....',
  '....1122233333322211....',
  '.....12223322332221.....',
  '.....11232222223211.....',
  '......112222222211......',
  '.......1111221111.......',
  '.........111111.........',
  '........................',
  '........................',
];
