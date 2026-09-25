import { definePassiveItem } from '../shared.js';

export const id = 'warChest';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'WAR CHEST',
    max: 1,
    theme: 0xf57f17,
    // THE MONEY YOU DID NOT SPEND IS THE STAT. One point of damage per
    // thousand banked, read live off the balance, so it climbs as the wave
    // pays out and DROPS the moment the player buys anything - which is the
    // entire pick. Everything else in the game wants the money spent; this is
    // the one voice arguing for the hoard, and it has to lose that argument
    // often enough to stay interesting.
    //
    // FLAT, AND ADDED TO THE WEAPON'S OWN DAMAGE BEFORE EVERY MULTIPLIER, so
    // it is worth the most to a build that has already stacked Hollow Point -
    // and worth exactly a thousand dollars a point to one that has not. A
    // thousand is the mystery box's own opening price, which is the only
    // number in this game a player already reads as "one purchase".
    effects: [['+1 DAMAGE PER $1,000', GOOD], ['CURRENTLY HELD', NOTE]],
    apply: (mods, n) => { mods.warChest = n; },
}));

export const icon = [
  '........................',
  '........................',
  '........................',
  '...........4.4..........',
  '.........4.....4...3....',
  '....4....343343.........',
  '........23343332....4...',
  '......443444444344......',
  '......223223322322......',
  '......111114111111......',
  '.....44222222222211.....',
  '.....42222222222221.....',
  '.....21111111111111.....',
  '.....42222222222221.....',
  '.....42222222222221.....',
  '.....12222222222221.....',
  '.....11222222222211.....',
  '.....11111111111111.....',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
];
