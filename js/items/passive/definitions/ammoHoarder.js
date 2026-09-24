import { definePassiveItem } from '../shared.js';

export const id = 'ammoHoarder';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'AMMO HOARDER',
    max: 1,
    theme: 0xffea00,
    // It is the only passive item that touches reserve CAPACITY rather than
    // reserve income, which is what makes it worth a slot
    // next to Scavenger and Ammo Fabricator instead of competing with them.
    effects: [['2x AMMO RESERVE', GOOD], ['300 \u2192 600 ROUNDS', NOTE]],
    apply: (mods, n) => { mods.reserveMult = 1 + n; },
}));

export const icon = [
  '........................',
  '........................',
  '.......22221.22221......',
  '.......22221.22221......',
  '.......22221.22221......',
  '.......22221.22221......',
  '.......22221.22221......',
  '.......22221.22221......',
  '.......23322.23322......',
  '........422...232.......',
  '........22.....22.......',
  '........................',
  '........................',
  '....2221..22221..2221...',
  '....2221..22221..2221...',
  '....2221..22221..2221...',
  '....2221..22221..2221...',
  '....2221..22221..2221...',
  '....2221..22221..2221...',
  '....4332..43332..4332...',
  '....2332..23322..4322...',
  '.....222...222...222....',
  '......2.....2.....2.....',
  '........................',
];
