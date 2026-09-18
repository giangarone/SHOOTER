import { definePassiveItem } from '../shared.js';

export const id = 'scavenger';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'SCAVENGER',
    max: 3,
    theme: THEME.salvage,
    effects: (n) => [
      ['+2 AMMO PER KILL', GOOD],
      ['FROM ' + step(n, (k) => '+' + 2 * k), NOTE],
    ],
    apply: (mods, n) => {
      mods.ammoOnKill += 2 * n;
    },
}));

// THE BIRD THAT PICKS OFF THE DEAD. The magnet is gone: a crow is the animal
// the name already meant, hunched forward off its perch with one round hanging
// from the bill - the kills paying ammunition, carried off before it lands.
// It is not the magpie twice: MAGPIE stands upright on a pale belly with a
// long thin tail and a coin, so this one faces the other way, all dark, the
// bill half as deep as the head and the tail a broad blade slanting down
// behind it. The pale pixel is the eye and nothing else needs to be.
export const icon = [
  '........................',
  '........................',
  '........................',
  '.....21.................',
  '....243421..............',
  '..222333321.............',
  '.222224333321...........',
  '.2222222233331..........',
  '.11122222223332.........',
  '42..2222221123341.......',
  '232.12222111123211......',
  '.42..222221111121.......',
  '.232.12222221111221.....',
  '..22..222222211111221...',
  '......122222211.1122221.',
  '.......2222111....11221.',
  '.......21121........111.',
  '.......21.21............',
  '.......21.21............',
  '.......21.21............',
  '.......11.11............',
  '........................',
  '........................',
  '........................',
];
