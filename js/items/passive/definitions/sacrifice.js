import { definePassiveItem } from '../shared.js';

// THE ONE PICK THAT TAKES SOMETHING BACK. It is small on purpose: what it
// costs is not the ten percent, it is that the totem is a coin toss with the
// rest of the build - and the deeper the build, the worse the odds get.
export const id = 'sacrifice';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'SACRIFICE',
    max: 1,
    theme: 0x6d1b7b,
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

// THE PRICE, ON THE ALTAR. The dagger standing in the stone, the flame
// where it went in, the crack where it paid, and the shard coming off.
export const icon = [
  '........................',
  '........................',
  '........................',
  '...........44...........',
  '...........22...........',
  '...........41...........',
  '........42222221........',
  '...........44...........',
  '...........43...........',
  '...........43...........',
  '...........43...........',
  '...........43...........',
  '...........43...........',
  '.........4.43.4.........',
  '....4.....3113..........',
  '.........444444.........',
  '.........222222...3.....',
  '...1...4440444444..1....',
  '.......1111011111.4.....',
  '.....22222021222222.....',
  '.....11111111111111.....',
  '........................',
  '........................',
  '........................',
];
