import { definePassiveItem } from '../shared.js';

export const id = 'cursedAmmo';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'CURSED AMMO',
    max: 1,
    theme: THEME.hex,
    // The floor is the whole reason this is playable: without it a held
    // trigger kills you from full health with no enemy in the room.
    effects: [['20% OF SHOTS: 2x DMG', GOOD], ['THOSE SHOTS COST 1 HP', BAD], ['NEVER BELOW 1 HP', NOTE]],
    apply: (mods, n) => {
      mods.cursedChance = 0.2 * n;
      mods.cursedDamage = 1;
    },
}));

export const icon = [
  '........................',
  '.......22222222221......',
  '.......22222222221......',
  '.......22222222221......',
  '.......11111111111......',
  '........111111111.......',
  '........223333221.......',
  '........233333321.......',
  '........200330021.......',
  '........230330321.......',
  '........233333321.......',
  '........223303221.......',
  '........222333221.......',
  '........222333221.......',
  '........111111111.......',
  '........111111111.......',
  '........433333332.......',
  '........433333332.......',
  '........233333322.......',
  '.........4333332........',
  '.........2333322........',
  '..........23322.........',
  '...........432..........',
  '...........222..........',
];
