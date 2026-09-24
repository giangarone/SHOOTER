import { definePassiveItem } from '../shared.js';

// WHATEVER IS ON YOU IS ON THEM. It is the only pick in either pool that
// makes being burnt, poisoned or chilled into a thing worth having - a player
// standing in the lava is now a lit fuse walking through the crowd.
export const id = 'statusConduit';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'STATUS CONDUIT',
    max: 1,
    theme: 0x7cb9e8,
    effects: [['STATUS EFFECTS ON YOU', GOOD], ['SPREAD TO ENEMIES', NOTE], ['WITHIN 5m', NOTE]],
    apply: (mods, n) => { mods.conduit = 5 * n; },
}));

export const icon = [
  '........................',
  '..........2221..........',
  '.........223321.........',
  '.........223321.........',
  '.........123311.........',
  '..........1211..........',
  '...........21...........',
  '...........21...........',
  '.........444342.........',
  '........44333332........',
  '........43300332........',
  '........43000032........',
  '........43000032........',
  '...221.2433003331.221...',
  '..22222123333322222221..',
  '..223321.222222.223321..',
  '..233311........123331..',
  '..12221..........22211..',
  '...1111..........1111...',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
];
