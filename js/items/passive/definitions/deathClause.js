import { definePassiveItem } from '../shared.js';

// THE CONTRACT, SIGNED. Twenty percent damage, and the price is the FINAL
// ROUND OF THE MAGAZINE: miss with it and the signer bleeds five. The miss is
// read off the trigger pull the same way AIM OR BLEED reads it - the whole
// shot touched nothing - because "the final shot" is a question about the
// magazine, and a magazine's last round that hit nothing is the only miss
// the clause covers.
//
// THE BLEED HAS A FLOOR OF ONE, on CURSED AMMO'S terms and for its reason: a
// held trigger on an empty magazine must not be able to kill the player on
// its own. The floor is the difference between a price and a suicide button.
export const id = 'deathClause';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'DEATH CLAUSE',
    max: 1,
    theme: 0x5e35b1,
    effects: [['+20% DAMAGE', GOOD], ['MISS THE LAST ROUND', BAD], ['OF A MAG: LOSE 5 HP', BAD]],
    apply: (mods, n) => { mods.damage *= 1 + 0.2 * n; mods.deathClause = 5 * n; },
}));

// THE CONTRACT WITH A SIGNATURE. A page, a line of type, the signature
// crossing the bottom - and the one shape in the pool that means "you
// agreed to this".
export const icon = [
  '........................',
  '........................',
  '........................',
  '.....4444422222222......',
  '.....4222222222244......',
  '.....4222222222200......',
  '.....2333333222222......',
  '.....2233323333322......',
  '.....2333333233322......',
  '.....2233322222222......',
  '.....2333333323332......',
  '.....1111111111111......',
  '.....2222222222222......',
  '.....2343323433222......',
  '.....2333333333222......',
  '.....2222222222322......',
  '.....2111111111111.4....',
  '..................331...',
  '..................331...',
  '..................111...',
  '........................',
  '........................',
  '........................',
  '........................',
];
