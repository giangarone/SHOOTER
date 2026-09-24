import { definePassiveItem } from '../shared.js';

// THE HARSHEST WAVE. A square wave is a signal with two settings and no
// ramp between them, and so is this gun: trigger pulls alternate between a
// doubled round and a plain one, one shot each, forever. Per SHOT and not
// per pellet, the rule every per-shot pick follows - a scattergun's eight
// pellets are one step of the wave, not eight.
//
// WHICH STEP THE RUN IS ON IS THE TALLY, NOT A COUNTER. shotTally already
// counts every trigger pull for ECHO CHAMBER, so the wave cannot drift out
// of phase with anything, survive a reset it was never told about, or cost
// the one more field a dedicated flip-flop would need resetting.
export const id = 'squareWave';

export default definePassiveItem(({ GOOD, BAD, NOTE }) => ({
    name: 'SQUARE WAVE',
    max: 1,
    theme: 0xff5a3c,
    effects: [
      ['SHOTS ALTERNATE:', NOTE],
      ['2x DAMAGE, THEN 1x', GOOD],
    ],
    apply: (mods, n) => { mods.squareWave = n; },
}));

// THE TRACE ITSELF. Two levels, a vertical drop, a vertical rise - the
// oscilloscope picture of the wave the pick is named for, drawn as the
// scope sees it.
export const icon = [
  '........................',
  '........................',
  '........................',
  '........................',
  '..11111111111111111111..',
  '..12222222222222222221..',
  '..13333333222222333331..',
  '..14444443222223444441..',
  '..12222223222223222221..',
  '..12222223222223222221..',
  '..12222223222223222221..',
  '..12222223222223222221..',
  '..12222223333333222221..',
  '..12222223444443222221..',
  '..12222222222222222221..',
  '..11111111111111111111..',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
];
