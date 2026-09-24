import { definePassiveItem } from '../shared.js';

export const id = 'breachRound';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'BREACH ROUND',
    max: 1,
    theme: THEME.charge,
    // Armed by the reload rather than by a timer, so it rewards a rhythm the
    // player already has instead of asking them to stand still and not shoot.
    effects: [['FIRST SHOT AFTER A', GOOD], ['RELOAD EXPLODES:', GOOD], ['70 DMG IN 4m', NOTE]],
    apply: (mods, n) => {
      mods.chargeDamage = 70 * n;
      mods.chargeRadius = 4;
    },
}));

export const icon = [
  '........242..422........',
  '..2......42..42.........',
  '.2442....22..22....4422.',
  '..22242...4442...44222..',
  '.....2242.4332.42222....',
  '.......2244333222.......',
  '.........433332.........',
  '.......4223332242.......',
  '....44222.4332.2242.....',
  '..44222...2222...22442..',
  '.2222....42..42....2222.',
  '........111111111....2..',
  '........111111111.......',
  '........222222221.......',
  '........222222221.......',
  '.......4222222221.......',
  '.......2222222221.......',
  '........222222221.......',
  '........222222221.......',
  '........222222221.......',
  '........222222221.......',
  '........111111111.......',
  '........111111111.......',
  '........................',
];
