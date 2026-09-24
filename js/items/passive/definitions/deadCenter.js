import { definePassiveItem } from '../shared.js';

export const id = 'deadCenter';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'DEAD CENTER',
    max: 1,
    theme: 0xad1457,
    // TWICE THE PAYOUT FOR HALF THE DICE. On a bare 5% that is 1.5x on one
    // shot in twenty against 3x on one in forty - almost exactly the same
    // damage per magazine, and nothing like the same magazine. It is cursed
    // because the variance is the drawback: a run carrying this hits a wall
    // of chaff at ordinary damage for ten seconds and then removes a tank in
    // two rounds, and the player does not get to choose when.
    //
    // IT MULTIPLIES THE HALVING RATHER THAN SUBTRACTING, so it composes with
    // whatever the build has stacked: half of 45% is 22.5%, half of the bare
    // 5% is 2.5%, and neither can be driven to zero. Order does not matter -
    // rebuildMods replays the whole list from defaults, and a multiply and an
    // add on the same field commute for every combination the pool can offer.
    effects: [['CRITS DEAL 3x DAMAGE', GOOD], ['CRIT CHANCE HALVED', BAD]],
    apply: (mods, n) => {
      mods.critMult = 3;
      mods.critChance *= Math.pow(0.5, n);
    },
}));

export const icon = [
  '........................',
  '.........111111.........',
  '......111111111111......',
  '.....11122222222111.....',
  '....1122200000022211....',
  '...112200000000002211...',
  '..11220002222220002211..',
  '..11200222000022200211..',
  '..12200200033000200221..',
  '.1120022033333302200211.',
  '.1120020034433300200211.',
  '.1120020334433330200211.',
  '.1120020333333330200211.',
  '.1120020033333300200211.',
  '.1120022033333302200211.',
  '..12200200033000200221..',
  '..11200222000022200211..',
  '..11220002222220002211..',
  '...112200000000002211...',
  '....1122200000022211....',
  '.....11122222222111.....',
  '......111111111111......',
  '.........111111.........',
  '........................',
];
