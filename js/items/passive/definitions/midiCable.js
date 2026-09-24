import { definePassiveItem } from '../shared.js';

// THE CABLE THAT REROUTES THE SLOT. A MIDI cable does not make sound; it
// tells some other machine what to play. This one is wired between the item
// slot and the pool: at every wave clear, whatever the player is carrying is
// unplugged and a random item is patched in its place, arriving fully
// charged - the wave clear is the one moment the slot can change hands
// without stealing a charge the player had earned.
//
// NOTHING, WHILE THE SLOT IS EMPTY. A player carrying no item has nothing
// to reroute, and the pick waits rather than conjuring: the moment an item
// is taken - box, pedestal, wherever - the cable is live again at the next
// clear.
//
// THE OLD ITEM IS NOT REFUNDED. It is gone, exactly as it would be at the
// mystery box: the pick's whole price is that no item is ever kept long
// enough to be built around, and what it pays is a fresh charge every wave.
export const id = 'midiCable';

export default definePassiveItem(({ GOOD, BAD, NOTE }) => ({
    name: 'MIDI CABLE',
    max: 1,
    theme: 0xb4f06e,
    effects: [
      ['ACTIVE ITEM BECOMES', GOOD],
      ['A RANDOM ONE EACH WAVE', NOTE],
      ['FULLY CHARGED', GOOD],
    ],
    apply: (mods, n) => { mods.midiCable = n; },
}));

// THE FIVE-PIN PLUG. MIDI's own connector on its cable - the round DIN with
// the arc of five pins, drawn as the cable that patches one machine into
// another.
export const icon = [
  '........................',
  '..........2112..........',
  '..........2112..........',
  '..........2112..........',
  '..........2112..........',
  '..........2112..........',
  '..........2112..........',
  '..........2112..........',
  '..........2112..........',
  '..........1111..........',
  '........11111111........',
  '.......3322332233.......',
  '......144224422441......',
  '......112222222211......',
  '......122332233221......',
  '......122442244221......',
  '......112222222211......',
  '......112222222211......',
  '.......1122222211.......',
  '........11111111........',
  '..........1111..........',
  '........................',
  '........................',
  '........................',
];
