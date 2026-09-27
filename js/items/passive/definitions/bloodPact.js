import { definePassiveItem } from '../shared.js';

export const id = 'bloodPact';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'BLOOD PACT',
    max: 1,
    theme: 0xb71c1c,
    effects: [['KILLS HEAL 3 HP', GOOD], ['TAKE 25% MORE DAMAGE', BAD]],
    apply: (mods, n) => {
      mods.killHeal = 3 * n;
      mods.damageTakenMult *= 1 + 0.25 * n;
    },
}));

// THE SEALED CONTRACT. Three lines in a hand nobody reads twice, signed in
// the only ink this pool takes, with the stamp still warm at the bottom.
export const icon = [
  '........................',
  '........................',
  '........................',
  '......222222222221......',
  '.....42222222222221.....',
  '.....42222222222221.....',
  '.....22222222222221.....',
  '.....22111111112221.....',
  '.....22222222222221.....',
  '.....22222222222221.....',
  '.....22111111111221.....',
  '.....22222222222221.....',
  '.....22222222222221.....',
  '.....22111111222221.....',
  '.....22222222233321.....',
  '.....22222222433331.....',
  '.....22222222333331.....',
  '.....22222222233321.....',
  '.....22222222222121.....',
  '......222222222222......',
  '......111111111111......',
  '........................',
  '........................',
  '........................',
];
