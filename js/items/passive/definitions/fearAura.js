import { definePassiveItem } from '../shared.js';

// TERROR WITHOUT THE BULLET. Five metres is close enough that it only ever
// answers the thing already on top of you, and the half-minute lockout is
// what stops a fled enemy from walking back in and fleeing again forever.
export const id = 'fearAura';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'FEAR AURA',
    max: 1,
    theme: THEME.fearAura,
    effects: [['ENEMIES WITHIN 5m FLEE', GOOD], ['EACH AT MOST EVERY 30s', NOTE]],
    apply: (mods, n) => {
      mods.fearAura = 5 * n;
      mods.fearAuraTime = 5;
      mods.fearAuraCd = 30;
    },
}));

export const icon = [
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........44444442........',
  '......422222222242......',
  '.....222........222.....',
  '....22....4442....22....',
  '........42222242........',
  '.......222....222.......',
  '......22........22......',
  '.......2........2.......',
  '..........2221..........',
  '.........222221.........',
  '.........222221.........',
  '.....42..122211..42.....',
  '....422...1221...232....',
  '...422.....221....232...',
  '..442......221.....432..',
  '..232......221.....422..',
  '...232.....221....422...',
  '....232....111...422....',
  '.....22..........22.....',
];
