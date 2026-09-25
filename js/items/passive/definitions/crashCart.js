import { definePassiveItem } from '../shared.js';

// THE CRATE, AT THE BOTTOM OF THE BAR. Twenty-five health is a quarter of a
// fresh run's bar and a rounding error on a run that has banked forty points
// of max HP; a hundred is a whole life, and it is only ever paid to a player
// who is twenty points from losing one.
//
// A FLOOR, NOT A MULTIPLIER. It does not scale with anything - not the
// build, not the wave, not healMult - which is what keeps it a rescue rather
// than a healing strategy: a run at 15 health gets a hundred, and a run at 21
// gets the ordinary twenty-five, and the player can see exactly which side of
// the line they are on because the number is on the HUD.
//
// IT REPLACES THE CRATE'S OWN HEAL rather than adding to it, and it goes
// through the same door: FIRE SALE still doubles it, SLOW RELEASE still owes
// it over twenty seconds, GRISTLE still tosses its coin. One crate, one
// payout, whichever size it was.
export const id = 'crashCart';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'CRASH CART',
    max: 1,
    theme: 0xff4d6d,
    effects: [['UNDER 20 HP, HEALTH', NOTE], ['CRATES HEAL 100 HP', GOOD]],
    apply: (mods, n) => { mods.crashCart = 100 * n; mods.crashCartAt = 20; },
}));

export const icon = [
  '........................',
  '........................',
  '........................',
  '.......22......22.......',
  '......2442....2442......',
  '.....24422222222222.....',
  '.....22423300322222.....',
  '.....22223000033321.....',
  '.....22222303322221.....',
  '.....22222222222221.....',
  '.....22222233222221.....',
  '.....22223333332221.....',
  '.....22222233222221.....',
  '.....22222222222221.....',
  '.....11111111111111.....',
  '......22........22......',
  '......00........00......',
  '......11........11......',
  '...........34...........',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
];
