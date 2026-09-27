import { definePassiveItem } from '../shared.js';

export const id = 'ceramicInsert';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'CERAMIC INSERT',
    max: 1,
    theme: 0x80deea,
    // A CEILING, NOT A REDUCTION, and the difference is the whole pick. Damage
    // reduction is worth the same against a chaser's scratch as against a
    // boss's slam; a cap is worth NOTHING against the scratch and everything
    // against the slam. What it buys is that no single thing in the game can
    // take more than a quarter of the bar, so four hits is the fewest the run
    // can ever end in, whatever wave it is.
    //
    // IT SITS INSIDE Player.takeDamage, after curse and before the shield, so
    // it is the last word on what a hit costs: everything that multiplies
    // incoming damage - BLOOD PACT, RED MIST, a curse, a hazard - has already
    // had its say by then and none of them can push a hit past the cap.
    effects: [['NO HIT CAN TAKE MORE', GOOD], ['THAN 25% OF MAX HP', NOTE]],
    apply: (mods, n) => { mods.hitCap = 0.25 / n; },
}));

// THE STRIKE FACE, ONE HIT IN. Punched slug, four cracks, spall ring - and
// the plate still a plate, which is the whole card.
export const icon = [
  '........................',
  '........................',
  '........................',
  '........................',
  '......422222222221......',
  '.....42222222222221.....',
  '....4222222222222221....',
  '....4222222222222221....',
  '....4222222112222221....',
  '....4222222022222221....',
  '....2222202022022221....',
  '....2222102412202221....',
  '....2222120112021221....',
  '....2222212202122221....',
  '....2222222202222221....',
  '....22222222222222111...',
  '....22222222122221111...',
  '....22222222222211111...',
  '....22222222222222211...',
  '.....222222222222211....',
  '......122222222221......',
  '........................',
  '........................',
  '........................',
];
