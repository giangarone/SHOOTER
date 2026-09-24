import { definePassiveItem } from '../shared.js';

export const id = 'ceramicInsert';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'CERAMIC INSERT',
    max: 1,
    theme: THEME.ceramic,
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

export const icon = [
  '........................',
  '........................',
  '........................',
  '........................',
  '...122222222222222211...',
  '....2222222222222221....',
  '....2211111111111121....',
  '....2211100000011121....',
  '....2210000000000121....',
  '....2210003333000121....',
  '....2200334444330021....',
  '....2200334004330021....',
  '....2200344004430021....',
  '....1200334444330011....',
  '.....20003444430001.....',
  '.....22000333300021.....',
  '.....22100000000121.....',
  '.....22110000001121.....',
  '.....22111111111121.....',
  '.....22222222222221.....',
  '.....11111111111111.....',
  '........................',
  '........................',
  '........................',
];
