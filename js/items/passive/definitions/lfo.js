import { definePassiveItem } from '../shared.js';

// THE LOW-FREQUENCY OSCILLATOR. In the music this game plays, an LFO is the
// hand that turns somebody else's knob: too slow to hear as a note, fast
// enough to watch a dial move. Here it is wired to three dials at once -
// damage, fire rate, move speed - and it sweeps them between two settings on
// a one-second-per-side square. The card lists the two settings and nothing
// about the clock, for the same reason a player does not need to know a BPM
// to nod along: the alternation is felt in the run itself, in the legs
// especially, long before it needs naming.
//
// THE PHASE IS THE CLOCK, NOT A COUNTER. Nothing tracks "which half" on the
// Player: the second the run is in answers that (Player.lfoPhase), so the
// sweep cannot drift out of step with itself across a pause, a handoff or a
// load, and there is no state to forget to reset.
//
// ALL THREE RIDE ONE PHASE on purpose. A pick that peaked damage while
// troughing speed would read as two picks wearing one card; what the name
// sells is one slow movement felt everywhere at once.
export const id = 'lfo';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE }) => ({
    name: 'LFO',
    max: 1,
    theme: THEME.lfo,
    effects: [
      ['DAMAGE +30% / -10%', GOOD],
      ['FIRE RATE +25% / -15%', GOOD],
      ['SPEED +15% / -5%', GOOD],
    ],
    apply: (mods, n) => { mods.lfo = n; },
}));

// A MODULE WITH ITS TRACE. The oscillator as hardware: a panel, one knob,
// and the sweep it is currently drawing across the scope - one smooth curve
// leaving the panel at both ends, so it reads as a WAVE travelling rather
// than a squiggle sitting still.
export const icon = [
  '........................',
  '........................',
  '........................',
  '...111111111111111111...',
  '...122222222222222221...',
  '...124422222222222221...',
  '...124422222223332221...',
  '...122222222232223221...',
  '...122222222222222321...',
  '...122222222322222231...',
  '...132222223222222221...',
  '...123222222222222221...',
  '...122322232222222221...',
  '...122244422222222221...',
  '...122222222222222221...',
  '...122222222222222221...',
  '...111111111111111111...',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
];
