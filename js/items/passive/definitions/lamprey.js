import { definePassiveItem } from '../shared.js';

export const id = 'lamprey';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'LAMPREY',
    max: 1,
    theme: 0x00897b,
    // TEN DAMAGE ON THE DOWNBEAT - once a beat, not twice. It used to bite on
    // every pulse, which is the half-beat edge the sentry guns and every fire
    // tick ride, and at ten a bite that made a free permanent companion worth
    // two bees. One bite a WHOLE beat is the rate the card always claimed and
    // it is the rate you can hear: the leech chews on the kick drum, so what
    // it is doing is legible without a damage number.
    //
    // The benchmark is still a bee's damage - except this one never expires and
    // never has to be paid for again. What balances that is REACH: a bee flies
    // forty metres at whatever it likes, and the lamprey will not leave the
    // player's side for more than LAMPREY_RANGE. It is a bodyguard, so it is
    // only ever worth anything to a player who is already in trouble.
    //
    // ON THE BEAT, like the turret, the sentry and every fire tick in the game.
    // Nothing rhythmic in this game runs on a private timer - see Music.pulse.
    effects: [['A PET LEECH FIGHTS', NOTE], ['BESIDE YOU', NOTE], ['KILLS HEAL YOU 2 HP', GOOD]],
    apply: (mods, n) => { mods.lamprey = n; },
}));

// THE PET THAT BITES BACK. A ringed leech curled around its toothy maw,
// tail tucked, with the two health its kills pay already dripping beside it.
export const icon = [
  '........................',
  '........................',
  '........................',
  '.....433................',
  '....4331................',
  '....422.................',
  '....4232................',
  '.....2332...............',
  '.......4331.............',
  '..........4333331.......',
  '..........3424241.......',
  '..........3000001.......',
  '..........3242421.......',
  '..........2333331.......',
  '......433331............',
  '.....423221........3....',
  '.....22321........433...',
  '.....211..........331...',
  '...................3....',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
];
