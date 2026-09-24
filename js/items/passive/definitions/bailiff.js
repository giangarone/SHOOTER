import { definePassiveItem } from '../shared.js';

export const id = 'bailiff';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'BAILIFF',
    max: 1,
    theme: 0x90a4ae,
    // A FIFTH OF EVERY PRESS BACK. It is the only passive item in the pool
    // that reaches the active-item slot at all besides TWIN CELL, and the two
    // are opposites worth owning together: Twin Cell lets the player BANK a
    // second charge, this makes each one cost four fifths of what it did.
    //
    // A REFUND AND NOT A DISCOUNT, which is why it is written as charge handed
    // back after the spend rather than as a cheaper cost: the meter empties
    // when the button is pressed, exactly as it always has, and then a fifth
    // of it comes back. The player sees the item fire and the bar jump.
    effects: [['USING YOUR ITEM', NOTE], ['REFUNDS 20% OF', GOOD], ['ITS CHARGE', NOTE]],
    apply: (mods, n) => { mods.bailiff = Math.min(0.9, 0.2 * n); },
}));

export const icon = [
  '........................',
  '..........2.............',
  '..........442...........',
  '.......1..43342.........',
  '......21..433332........',
  '.....221..4333222.......',
  '....2111..43222.........',
  '...221....432...........',
  '..2211....2221..........',
  '..221......221.....221..',
  '..211....2222221...121..',
  '..21.....2000001....21..',
  '.221.....2000001....221.',
  '.121.....2000001....211.',
  '..21.....2000001....21..',
  '..221....2000001...221..',
  '..221....2000001...221..',
  '..1221...2000001..2211..',
  '...121...2333331..211...',
  '....1221.23333322211....',
  '.....12222222222211.....',
  '......122222222211......',
  '.......1111211111.......',
  '...........11...........',
];
