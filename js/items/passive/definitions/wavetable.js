import { definePassiveItem } from '../shared.js';

// FOUR MAGAZINES, FOUR ELEMENTS. A wavetable synth carries a bank of waves and
// steps through them; this pick mounts the same bank on the gun; a magazine
// is one slot in it. Every round out of the current magazine carries one
// element - fire, then ice, then poison, then fear - and the next reload
// seats the next one, so the fourth reload hands back the first.
//
// THE ELEMENT BELONGS TO THE MAGAZINE, NOT TO THE SHOT. The advance happens
// at the one instant a new magazine exists (the reload's seating edge in
// Player.update), so a wave's worth of rounds carries one element all the
// way down and the whole pool of per-hit readers - _landShot's per-shot
// half - can read a single index.
//
// THE FOUR ARE THE DEDICATED PICKS' OWN, a shade shorter: the card sells
// having all four across four magazines, exactly as FOUR HUMOURS sells all
// four in one item, and for the same reason neither may out-do the picks a
// draft spent a slot on.
export const id = 'wavetable';

export default definePassiveItem(({ GOOD, BAD, NOTE }) => ({
    name: 'WAVETABLE',
    max: 1,
    theme: 0x35e0a1,
    effects: [
      ['EACH MAGAZINE CARRIES', NOTE],
      ['FIRE, ICE, POISON, FEAR', GOOD],
      ['CHANGES ON RELOAD', NOTE],
    ],
    apply: (mods, n) => { mods.wavetable = n; },
}));

// THE BANK ITSELF. Four cells in a cross-divided window, each holding a
// different miniature wave - a ramp, a step, a sine, a scatter - which is
// what a wavetable is: not one shape, a shelf of them.
export const icon = [
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '..44444444444444444441..',
  '..42222222211222222221..',
  '..42222322211233322221..',
  '..42223232211222322221..',
  '..42332223211222333321..',
  '..42222222211222222221..',
  '..41111111111111111111..',
  '..41111111111111111111..',
  '..42222222211222222221..',
  '..42223222211222223221..',
  '..42232322211232222221..',
  '..42322232211222322221..',
  '..42222223211223222321..',
  '..42242222211222224221..',
  '..11111111111111111111..',
  '........................',
  '........................',
  '........................',
  '........................',
];
