import { definePassiveItem } from '../shared.js';

// ONE BLOW, SPLIT EVERY WAY. It is a crowd-clearing pick wearing a drawback:
// against a lone boss it changes nothing at all, and against thirty bodies it
// turns a rifle into a room-wide tick that kills the whole wave at once.
// Every source, so poison, turrets, blasts and lightning are all in it.
export const id = 'sharedPain';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'SHARED PAIN',
    max: 1,
    theme: 0x7e57c2,
    effects: [['EVERY HIT SPLITS ITS', GOOD], ['DAMAGE EVENLY ACROSS', NOTE], ['ALL ENEMIES', NOTE]],
    apply: (mods, n) => { mods.sharedPain = n; },
}));

export const icon = [
  '..........2221..........',
  '..........2221..........',
  '..........2221..........',
  '..........2221..........',
  '.........122211.........',
  '..........1211..........',
  '...........21...........',
  '...........11...........',
  '........................',
  '..........2221..........',
  '.........222221.........',
  '.........220021.........',
  '.........220021.........',
  '.........422222.........',
  '........42132132........',
  '.......422.42.232.......',
  '......422..42..232......',
  '...2.422...42...232.2...',
  '...4422....42....2342...',
  '...432....4432....432...',
  '..22222...2322...22222..',
  '..2........22........2..',
  '........................',
  '........................',
];
