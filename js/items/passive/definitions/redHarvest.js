import { definePassiveItem } from '../shared.js';

// A CRIT, PAID IN BLOOD. One point is almost nothing per crit and is the
// whole pick over a magazine: a DEADEYE build crits a third of its shots, so
// this is a health bar that fills while the trigger is held and nothing at
// all to a build that never crits - which is the trade it is priced at.
//
// ONCE PER TRIGGER PULL, like every other question about a crit. A scattergun
// landing nine pellets on one chest is one crit and one coin, not nine.
export const id = 'redHarvest';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'RED HARVEST',
    max: 1,
    theme: THEME.redHarvest,
    effects: [['CRITS HEAL 1 HP', GOOD], ['50% OF THE TIME', NOTE]],
    apply: (mods, n) => { mods.critHealChance = 0.5 * n; mods.critHeal = 1; },
}));

export const icon = [
  '........................',
  '.........2221...........',
  '.......22222221.........',
  '.....221111111221.......',
  '....2211......1221......',
  '....211........121......',
  '...221..........221.....',
  '...211....42....121.....',
  '...21....4432....21.....',
  '...21....4332....21.....',
  '...21....2322....21.....',
  '...221....22....221.....',
  '...121..........211.....',
  '....221........241......',
  '....1221......2221......',
  '.....122222222232.......',
  '......112222222332......',
  '........11111233332.....',
  '.............433332.....',
  '.............233332.....',
  '..............23322.....',
  '...............222......',
  '........................',
  '........................',
];
