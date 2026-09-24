import { definePassiveItem } from '../shared.js';

// THE ONE PICK THAT TAKES SOMETHING BACK. It is small on purpose: what it
// costs is not the ten percent, it is that the totem is a coin toss with the
// rest of the build - and the deeper the build, the worse the odds get.
export const id = 'sacrifice';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'SACRIFICE',
    max: 1,
    theme: THEME.sacrifice,
    effects: [['+10% DAMAGE & FIRE RATE', GOOD], ['DESTROYS ONE OTHER', BAD], ['PASSIVE ITEM YOU OWN', BAD]],
    apply: (mods, n) => {
      mods.damage *= 1 + 0.1 * n;
      mods.fireRate *= 1 + 0.1 * n;
      // The removal itself is NOT here. apply() is replayed from fresh
      // defaults on every draft pick (see rebuildMods), so an apply() that
      // dropped a passive item would drop another one every time the player took
      // anything at all. It happens once, at the pick - see Player.takePassiveItem.
      mods.sacrifice = n;
    },
}));

export const icon = [
  '........................',
  '...........442..........',
  '...........432..........',
  '...........432..........',
  '...........432..........',
  '...........432..........',
  '...........432..........',
  '...........432..........',
  '...........432..........',
  '........444433442.......',
  '........223332222.......',
  '..........4332..........',
  '..........4332..........',
  '......2222233222221.....',
  '......2222222222221.....',
  '......2222222222221.....',
  '......1111111111111.....',
  '........................',
  '........................',
  '......2222222222221.....',
  '......2222222222221.....',
  '......2222222222221.....',
  '......2222222222221.....',
  '......1111111111111.....',
];
