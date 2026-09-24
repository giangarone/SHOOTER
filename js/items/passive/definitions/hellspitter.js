import { definePassiveItem } from '../shared.js';

// VENOMGRID'S TWIN, IN FIRE, and the two are deliberately the same pick
// wearing different damage: fire is short and fierce where poison is long and
// shallow (see the note at the top of status.js), so which of them a run is
// offered changes what its sentries are FOR - a poison grid wears a boss down
// and a burning one clears a crowd.
export const id = 'hellspitter';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'HELLSPITTER',
    max: 1,
    theme: 0xd1440f,
    effects: [['YOUR TURRETS IGNITE', GOOD], ['WHAT THEY HIT', NOTE]],
    apply: (mods, n) => { mods.turretBurn = 1 * n; mods.turretBurnTime = 3; },
}));

export const icon = [
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '.....................42.',
  '...222222222221......42.',
  '...220002222221....4442.',
  '...200000222222222242222',
  '...200000222222222232...',
  '...200002222221111332...',
  '...222022222221...4332..',
  '...112222221111...4332..',
  '.....2222221......2222..',
  '.....2222221............',
  '....222221121...........',
  '....211221.21...........',
  '...221.221.121..........',
  '...211.221..21..........',
  '...21..121..121.........',
  '...11...11...11.........',
];
