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
  '........................',
  '......244222222242......',
  '......222222222222......',
  '......200000000002......',
  '......243434343432......',
  '......233333333332......',
  '.....24422222222222.....',
  '.....22222200222222.....',
  '.....22222200332221.....',
  '.....22322200222321.....',
  '.....223222222222311....',
  '.....22222222222211.....',
  '.....22222222222211.....',
  '.....11111111111111.....',
  '......22........22......',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
];
