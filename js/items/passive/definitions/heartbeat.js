import { definePassiveItem } from '../shared.js';

// THE ROOM'S OWN PULSE, TURNED AGAINST IT. One damage is almost nothing to
// one enemy and is the pick against THIRTY of them - which is the shape it is
// priced for: a flat point per body per downbeat is worth exactly as much as
// the wave is crowded, and a boss standing alone barely notices it.
//
// A FLAT POINT AND NOT A FRACTION, deliberately. Everything else that scales
// with the build scales with the build; this is the one number in the pool
// that does not, and what that buys is a pick whose value is about the SIZE
// OF THE WAVE rather than about the gun - so it is worth taking on a run that
// has drafted no damage at all.
export const id = 'heartbeat';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'HEARTBEAT',
    max: 1,
    theme: THEME.heartbeat,
    effects: [['EVERY DOWNBEAT: EACH', NOTE], ['ENEMY HAS A 20% CHANCE', GOOD], ['TO TAKE 1 DAMAGE', NOTE]],
    apply: (mods, n) => { mods.heartbeat = 0.2 * n; mods.heartbeatHit = 1; },
}));

export const icon = [
  '...............222..242.',
  '.............2...42..22.',
  '............242..232..42',
  '.....1....21.432..22..22',
  '...22221.22222332..42..2',
  '..222222222222122..42..2',
  '..2222222222221.42.232.2',
  '..2222222222221.42..42.2',
  '..2222222222221.42..42.2',
  '..1222222222211.42..42.2',
  '...22222222211..42..42.2',
  '...1222222221...42..42.2',
  '....122222211...42..22.2',
  '.....2222211...422.42..2',
  '.....122221....22..42..2',
  '......12211...42..422.42',
  '.......111..2222..22..42',
  '........1....2...42..422',
  '................422..22.',
  '..............2222..42..',
  '...............2...422..',
  '..................422...',
  '................4222....',
  '................22......',
];
