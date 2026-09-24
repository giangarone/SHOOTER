import { definePassiveItem } from '../shared.js';

// THE PUMP EVERY TRACK ALREADY HAS. Sidechain compression is the sound of a
// whole mix flinching when the kick lands - and here the kick is the player's
// own trigger: the first enemy a trigger pull touches takes the shot, and
// everything else in the room takes one point with it. Flat, deliberately,
// exactly as THUNDERCLAP's five is flat: one point stays one point whether
// the rifle is fresh or carrying a full damage build, which is what keeps
// the pick a finisher's tool rather than a damage multiplier in disguise.
//
// ONE PULSE PER TRIGGER PULL, on the DETONATOR pattern: a scattergun that
// puts eight pellets into one chest is one kick, and so is a piercing round
// that walked two bodies - the latch lives in _beginShot with the other
// once-per-press flags.
export const id = 'sidechain';

export default definePassiveItem(({ GOOD, BAD, NOTE }) => ({
    name: 'SIDECHAIN COMPRESSION',
    max: 1,
    theme: 0x66c7ff,
    effects: [
      ['HITS DEAL 1 DAMAGE', GOOD],
      ['TO ALL OTHER ENEMIES', NOTE],
    ],
    apply: (mods, n) => { mods.sidechain = n; },
}));

// THE METER DUCKING. A level readout mid-flinch: bars falling away left to
// right, each one pale where the pulse just caught it - the gain-reduction
// dance every sidechained mix does on the beat.
export const icon = [
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '...111111111111111111...',
  '...122222222222222221...',
  '...124422222222222221...',
  '...123322222222222221...',
  '...123324422222222221...',
  '...123323322222222221...',
  '...123323324422222221...',
  '...123323323322222221...',
  '...123323323324422221...',
  '...123323323323324421...',
  '...123323323323323321...',
  '...111111111111111111...',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
];
