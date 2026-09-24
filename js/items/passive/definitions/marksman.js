import { definePassiveItem } from '../shared.js';

export const id = 'marksman';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'MARKSMAN',
    max: 1,
    theme: 0xf50057,
    // The same pick, bigger. Two entries rather than one that
    // stacks because the crit chance is a number with a CEILING that matters -
    // past about half, a crit stops reading as a crit and starts reading as
    // the damage number flickering - and a stacking entry would walk into that
    // on its own. 5 + 15 + 25 is 45%, which is as far as the pool goes.
    effects: [['+25% CRIT CHANCE', GOOD]],
    apply: (mods, n) => { mods.critChance += 0.25 * n; },
}));

export const icon = [
  '........................',
  '........................',
  '...2222221....2222221...',
  '..22222221....22222221..',
  '..22111111....11111221..',
  '..221..............221..',
  '..221..............221..',
  '..221..............221..',
  '..221..............221..',
  '..111......42......111..',
  '...........42...........',
  '.........444342.........',
  '.........223222.........',
  '...........42...........',
  '..221......22......221..',
  '..221..............221..',
  '..221..............221..',
  '..221..............221..',
  '..221..............221..',
  '..22222221....22222221..',
  '..12222221....22222211..',
  '...1111111....1111111...',
  '........................',
  '........................',
];
