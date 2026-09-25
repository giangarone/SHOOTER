import { definePassiveItem } from '../shared.js';

export const id = 'leadBalloon';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'LEAD BALLOON',
    max: 1,
    theme: 0x6d4c41,
    // TWENTY-FIVE PERCENT IS A LOT, and the jump is a lot to give up. The
    // arena has catwalks, the boxes are cover you get ON as often as behind,
    // and half the enemies in the pool are answered by not being where they
    // are looking. This is the cursed pick that takes away a VERB rather than
    // a number, which is the only kind of drawback a player cannot stat their
    // way out of later in the run.
    //
    // IT DOES NOT TOUCH THE DASH, THE SLIDE OR A LEDGE. Everything the player
    // has for getting out of a corner still works, and one of them - the slide
    // - is the thing they will end up using instead. Taking the jump is meant
    // to change how the room is crossed, not to nail the player to the floor.
    effects: [['+25% DAMAGE', GOOD], ['JUMPING IS DISABLED', BAD]],
    apply: (mods, n) => {
      mods.damage *= 1 + 0.25 * n;
      mods.noJump = 1;
    },
}));

// HEAVY AND GOING NOWHERE. The canopy sags onto its knot, the rope hangs
// straight to the lead, and the ground cracks politely underneath.
export const icon = [
  '........................',
  '........................',
  '........................',
  '........................',
  '.......4444444444.......',
  '.......2222222222.......',
  '...4..422222222222..4...',
  '....2.422222222222.2....',
  '...1..222122221221..1...',
  '.......2222212221.......',
  '........11111111........',
  '...........22...........',
  '...........1............',
  '...........12...........',
  '...........12...........',
  '........4444441.........',
  '........2002221.........',
  '........2220221.........',
  '........1111111.........',
  '........................',
  '....4111114111111111....',
  '...........1............',
  '........................',
  '........................',
];
