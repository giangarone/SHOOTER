import { definePassiveItem } from '../shared.js';

export const id = 'adrenaline';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'ADRENALINE',
    max: 1,
    theme: THEME.adrenaline,
    // CARNAGE, RUN BACKWARDS. Carnage climbs on kills and is lost the instant
    // anything touches you; this climbs on being touched and is lost at the
    // end of the wave. A run holding both has a damage number that never sits
    // still, and neither of them can be farmed: one is capped by the wave, the
    // other by the health bar.
    //
    // THE RESET IS THE WAVE AND NOT A CLOCK. A timer would make the pick about
    // stringing hits together, which is a thing the player would then try to
    // DO - and a passive item that pays the player for walking into a rusher
    // is the failure this whole entry is written around. A wave boundary is a
    // moment they do not control, so the ten stacks are something a bad wave
    // gave them rather than something a good one is farmed for.
    effects: [['+4% DAMAGE PER HIT TAKEN', GOOD], ['UP TO +40% EACH WAVE', NOTE]],
    apply: (mods, n) => {
      mods.adrenalineStep = 0.04 * n;
      mods.adrenalineMax = 0.4;
    },
}));

export const icon = [
  '........................',
  '.......22222222221......',
  '.......22222222221......',
  '.......11112211111......',
  '...........221..........',
  '...........111..........',
  '........................',
  '.........2222221........',
  '.........2222221........',
  '.........2333331........',
  '.........2333331........',
  '.........2333331........',
  '.........2333331........',
  '.........2333331........',
  '.........2333331........',
  '.........2333331........',
  '.........2333331........',
  '.........2333331........',
  '.........1121111........',
  '...........11...........',
  '............1...........',
  '............1...........',
  '............1...........',
  '............1...........',
];
