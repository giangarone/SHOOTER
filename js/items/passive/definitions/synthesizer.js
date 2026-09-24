import { definePassiveItem } from '../shared.js';

// THE PATCH CHANGES EVERY WAVE. A synthesizer is a cabinet of presets, and
// this pick wires the passive pool into one: at every wave clear it loads a
// random passive item's effect for the wave ahead, and at the next clear it
// loads another. The card says what it does and not what is currently loaded,
// because the wave-clear banner does that job in play - the player is told the
// name the moment it changes, which is the one moment the information is worth
// anything. The FIRST preset loads at the pick (see onTake): a player who
// bought a machine should hear it play.
//
// THE GRANT IS AN apply(), NEVER A takePassiveItem(). A taken pick would edit
// the OWNED LIST, which rebuildMods replays forever after; this is a rental.
// The current tenant lives on the Player (`synthItem`), and rebuildMods
// replays it on top of the owned list - so it stacks with the build, respects
// the replay contract, and dies with the wave that rented it.
//
// A HANDFUL OF IDS ARE NOT PRESETS. sacrifice and shuffle only manipulate the
// owned list at the moment of a pick, deathwish is a trade whose price is paid
// at the totem, and the synthesizer does not re-roll itself: none of them has
// an effect a rental can deliver, and a draw that landed one would read as the
// pick having done nothing at all.
export const id = 'synthesizer';

export default definePassiveItem(({ GOOD, BAD, NOTE }) => ({
    name: 'SYNTHESIZER',
    max: 1,
    theme: 0x8f6fd8,
    effects: [
      ['A NEW RANDOM PASSIVE', GOOD],
      ['ITEM EFFECT EACH WAVE', NOTE],
    ],
    apply: (mods, n) => { mods.synthesizer = n; },
    // The first preset arrives with the pick, not the next clear: "an effect
    // each wave" reads as broken if the wave the player is about to play has
    // none. takePassiveItem has just rebuilt the mods - by the time this runs
    // the pick owns its flag, so the draw can be replayed immediately.
    onTake: (player) => { player.rollSynthPick(); },
}));

// THE KEYBED. The instrument itself: a control panel of dials over a row of
// keys, one key mid-press - a sound is being made, and the pale key is the
// one making it.
export const icon = [
  '........................',
  '........................',
  '..11111111111111111111..',
  '..12222222222222222221..',
  '..12233223322332222221..',
  '..12244224422442222221..',
  '..12233223322332222221..',
  '..12244224422442222221..',
  '..11111111111111111111..',
  '........................',
  '..11111111111111111111..',
  '..12222122212221222121..',
  '..12222122214441222121..',
  '..12222122214441222121..',
  '..12222122214441222121..',
  '..12222122213331222121..',
  '..11111111111111111111..',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
];
