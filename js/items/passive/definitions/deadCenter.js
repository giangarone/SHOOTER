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

// THE RARE BIG ONE. A crosshair gone half-dim for the halved dice, with
// a triple-star core for the tripled payout - and the little three-pip
// die below that says which half of six you kept.
export const icon = [
  '........................',
  '........................',
  '........................',
  '........................',
  '..........4331..........',
  '........42222221........',
  '.......4222332221.......',
  '.......4222332221.......',
  '......433333111111......',
  '......333334411111......',
  '......333334411111......',
  '......333334411111......',
  '......322223311111......',
  '......322223311111......',
  '.......3222221111.......',
  '........22211111........',
  '..........2211..........',
  '................4331....',
  '................4321....',
  '................4231....',
  '................2111....',
  '........................',
  '........................',
  '........................',
];
