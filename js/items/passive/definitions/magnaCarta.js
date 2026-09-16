import { definePassiveItem } from '../shared.js';

// THE MAGAZINE THAT GROWS BY BEING RUN DRY. Every other mag pick scales the
// number the gun already has; this one banks one round per EMPTY RELOAD, so
// the magazine the run ends with is a count of the times the player stood
// there with the slide locked back. A run that never runs dry gets nothing,
// which is the honest shape of a card about bad habits paying off.
//
// THE BANK IS THE PICK. magMult would have multiplied whatever the build
// already did to the number and been worth more to a run holding HOLLOW
// POINT - a flat round per dry reload is the same for every gun, which is
// the only way "increase by 1" can stay true on the card.
export const id = 'magnaCarta';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'MAGNA CARTA',
    max: 1,
    theme: THEME.magnaCarta,
    effects: [['RELOAD FROM EMPTY:', NOTE], ['MAG +1, FOREVER', GOOD]],
    apply: (mods, n) => { mods.magnaCarta = n; },
}));

// A SCROLL WITH A SEAL. The Magna Carta itself, rolled: parchment body, wax
// seal at the foot, and the rows of the articles reading as horizontal lines.
export const icon = [
  '........................',
  '......22222222222.......',
  '.....2214444444122......',
  '.....2143223222322......',
  '.....2144223222322......',
  '.....2143323222322......',
  '.....2143223322322......',
  '.....2143223222422......',
  '.....2143323222422......',
  '.....2143223222322......',
  '.....2143223322322......',
  '.....2144223222322......',
  '.....2143323222322......',
  '.....2143223222422......',
  '.....2143223222322......',
  '.....2143323322422......',
  '.....2144223222322......',
  '.....2133223222322......',
  '.....2214444444222......',
  '......22333333222.......',
  '.......2233322111.......',
  '.......333433311........',
  '........33344311........',
  '.........33321..........',
];
