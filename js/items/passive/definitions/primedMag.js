import { definePassiveItem } from '../shared.js';

export const id = 'primedMag';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'PRIMED MAG',
    max: 1,
    theme: 0xff8f00,
    // THE TACTICAL RELOAD, PAID FOR. Every shooter teaches the habit of
    // topping up between fights and no shooter has ever paid for it; here the
    // rounds you did not fire are the bomb, so a magazine dropped at twenty is
    // four hundred damage and one dropped empty is nothing at all.
    //
    // THE ROUNDS ARE GONE, and that is the price. An ordinary reload TOPS the
    // magazine up - what is in it is kept and only the difference comes off
    // the reserve - and this one cannot, because the magazine is no longer
    // there. So a fresh one is filled from empty and a tactical reload costs
    // the whole thing. Without that the pick was free damage: fire one round,
    // reload, and twenty-nine went downrange for one round off the reserve.
    //
    // TWENTY A ROUND, NOT FIVE. At five a full-ish magazine was 145 damage -
    // less than SHORT FUSE, which is an active item costing thirty charge -
    // and the pick read as a decoration on a reload. At twenty the same throw
    // is 580, which is the biggest single number a passive item puts on the
    // board, and it is paid for twice: the whole magazine off the reserve, and
    // the four-metre radius, which is half SHORT FUSE's and means it only pays
    // when a crowd is already close enough to be a problem.
    //
    // IT CANNOT HURT THE PLAYER, unlike SHORT FUSE, which is the item the
    // blast is otherwise borrowed from. A thrown mag is not aimed - it goes
    // out on the reload, which is a button pressed for a different reason -
    // and a passive item that killed the player for reloading in a corridor
    // would be a passive item nobody could take.
    effects: [
      ['RELOADS THROW THE MAG', GOOD],
      ['AS A BLAST: 20 DMG PER', NOTE],
      ['ROUND LEFT IN IT', NOTE],
      ['THOSE ROUNDS ARE LOST', BAD],
    ],
    apply: (mods, n) => { mods.primedMag = 20 * n; },
}));

export const icon = [
  '........................',
  '..................442...',
  '.................42222..',
  '.................22..42.',
  '.................2...22.',
  '...........21....44442..',
  '..........1221..222222..',
  '...........222422.......',
  '..........222232........',
  '.........2222221........',
  '.......222003221........',
  '......22203333221.......',
  '....22200333322221......',
  '...222033330333221......',
  '.222003333033332221.....',
  '.1203333033332111211....',
  '..2333303333111..11.....',
  '..12303333211...........',
  '...123333111............',
  '....233211..............',
  '....12111...............',
  '.....11.................',
  '........................',
  '........................',
];
