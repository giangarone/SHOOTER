import { definePassiveItem } from '../shared.js';

// RATE IS BOUGHT WITH HANDLING, and it has to be bought at a price the
// player can feel or the card is a free passive item with a warning label on it.
// It was: +70% recoil on a weapon whose kick decays inside a third of a
// second read as almost nothing, and a passive item whose downside nobody
// can name is not a trade.
//
// So it charges twice, in the two currencies a gun has. RECOIL walks the
// muzzle up the wall and the player answers it with the stick. BLOOM opens
// the cone and the player can only answer it by letting go - which is the
// exact thing a doubled fire rate is tempting them not to do. That is the
// whole design of the card: it makes holding the trigger better AND it makes
// holding the trigger worse, and the player decides where the line is.
//
// Two tiers only, still: at three the gun climbs faster than a person can
// answer, and now sprays wider than the room.
export const id = 'hairTrigger';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'HAIR TRIGGER',
    max: 2,
    theme: 0xff6d00,
    effects: (n) => [
      ['FIRE RATE ' + step(n, pctUp(25)), GOOD],
      ['RECOIL ' + step(n, pctUp(160)), BAD],
      ['SPREAD ' + step(n, pctUp(90)), BAD],
    ],
    apply: (mods, n) => {
      mods.fireRate *= 1 + 0.25 * n;
      mods.recoilMult *= 1 + 1.6 * n;
      // The sustained-fire cone, which is where most of the accuracy cost
      // lands: this build's whole appeal is a held trigger, so the penalty
      // that scales with rounds held is the one that meets it.
      mods.bloomMult *= 1 + 0.9 * n;
      // Plus a flat widening the player can see the moment they take the card,
      // before they have fired a shot. A downside that only shows up eight
      // rounds into a magazine is one that gets picked by accident.
      mods.spreadAdd += 0.016 * n;
    },
}));

export const icon = [
  '........................',
  '........................',
  '.222222222222221........',
  '.222222222222221........',
  '.221112221111221...2....',
  '.221..4332...221...42...',
  '.221..4332...221..442...',
  '.221..4332...221.44332..',
  '.221..4332...221.23322..',
  '.221..4322...221..432...',
  '.221..422....221..432...',
  '.221..22.....221..432...',
  '.221..2......211..432...',
  '.221........221...432...',
  '.121........211...432...',
  '..221......221....432...',
  '..12221..22211....432...',
  '...1122222111.....432...',
  '.....111111.......432...',
  '..................432...',
  '..................432...',
  '..................432...',
  '..................222...',
  '........................',
];
