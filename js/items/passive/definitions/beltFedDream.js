import { definePassiveItem } from '../shared.js';

// NO MAGAZINE AT ALL. There is nothing to reload, nothing to run dry and
// nothing to time - the gun simply runs until the reserve does, at two rounds
// a shot. It is the biggest change to how the weapon FEELS in either pool,
// and what it costs is that the reserve is now the only number there is.
export const id = 'beltFedDream';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'BELT FED DREAM',
    max: 1,
    theme: 0xbf8f30,
    effects: [['NO MAGAZINE AT ALL:', GOOD], ['FIRES FROM RESERVE', NOTE], ['2 AMMO PER SHOT', BAD]],
    apply: (mods, n) => { mods.beltFedDream = n; mods.beltFedCost = 2; },
}));

export const icon = [
  '........................',
  '........222222221.......',
  '........122222211.......',
  '.........2222221........',
  '.........2222221........',
  '.....444443333334442....',
  '.....222233333322222....',
  '.........2222221........',
  '.........2222221........',
  '.........2222221........',
  '.........1111111........',
  '........................',
  '........................',
  '........................',
  '.22222222222222222222221',
  '.22222222222222222222221',
  '.22222222222222222222221',
  '.11221122111221122112221',
  '...432.432..432.432.4332',
  '...432.432..432.432.4332',
  '...432.432..432.432.4332',
  '...432.432..432.432.4332',
  '...222.222..222.222.2222',
  '........................',
];
