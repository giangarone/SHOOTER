import { definePassiveItem } from '../shared.js';

export const id = 'bloodsport';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'BLOODSPORT',
    max: 2,
    theme: 0xc62828,
    // THE MELEE ALREADY PAYS DOUBLE CREDITS and has always been the most
    // dangerous way to finish anything - you have to be inside its reach to
    // use it. This is the second half of that bargain: a swing that connects
    // is now a swing that pays for the hit you took getting there.
    //
    // ON THE KILL, NOT ON THE SWING. Healing per hit would make a held melee
    // button a health regen with a windup; the body has to actually go down.
    // It reads `meleeKill`, the same flag the credit double is decided on, in
    // the same sweep - so the two can never disagree about what a melee kill is.
    effects: (n) => [
      ['MELEE KILLS HEAL', GOOD],
      [step(n, (k) => 3 * k + ' HP'), GOOD],
    ],
    apply: (mods, n) => { mods.meleeHeal += 3 * n; },
}));

export const icon = [
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '..2222222222222222221...',
  '..2222222222222222221...',
  '..2200020002200020001...',
  '..2200020000000020001...',
  '..2200020002200020001...',
  '..2222222222222222221...',
  '..1222222222222222221...',
  '...111111111111111111...',
  '....11111111111111111...',
  '.....111111111111132....',
  '..................42....',
  '.................4432...',
  '................443332..',
  '................233322..',
  '.................2322...',
  '..................22....',
];
