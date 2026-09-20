import { definePassiveItem } from '../shared.js';

// THE SHAME OF A NEAR MISS, PRICED. A round that passes within half a metre
// of a body without touching it deals a tenth of the shot as chip damage -
// so a magazine aimed badly still pays SOMETHING, and a build that fired
// eight pellets past a crowd chips the whole crowd. The chip is flat
// (no crit, no multipliers beyond the shot's own worth) because it is a
// fraction of the SHOT, not a hit of its own.
//
// ONCE PER SHOT PER BODY, not per pellet: nine pellets flying past one chest
// is one near miss, exactly as it is one hit when they land. The half-metre
// band is measured against the body's own centre, so a flier's band is no
// wider than a crawler's.
export const id = 'stigmata';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'STIGMATA',
    max: 1,
    theme: THEME.stigmata,
    effects: [['MISSES PASSING WITHIN', NOTE], ['0.5m DEAL 10% OF', GOOD], ['THE SHOT AS CHIP', NOTE]],
    apply: (mods, n) => { mods.stigmata = n; },
}));

// THE HANDS, MARKED. Two palms shown flat, the marks on each - the shape
// that says the damage lands without the hit.
export const icon = [
  '........................',
  '........................',
  '.....22222...22222......',
  '....2333332.2333332.....',
  '...23333332.23333332....',
  '...23334432.23344332....',
  '...23334432.23344332....',
  '...23333332.23333332....',
  '...23333332.23333332....',
  '...23333332.23333332....',
  '...23343332.23343332....',
  '...23334432.23334432....',
  '...23333332.23333332....',
  '...23333332.23333332....',
  '...23333332.23333332....',
  '...23333332.23333332....',
  '....2333332.2333332.....',
  '.....223322..223322.....',
  '......2222....2222......',
  '.....221122..221122.....',
  '.....222222..222222.....',
  '........................',
  '........................',
  '........................',
];
