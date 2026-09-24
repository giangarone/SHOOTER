import { definePassiveItem } from '../shared.js';

// HALF A HEALTH BAR IS A LOT OF HEALTH BAR, and that is the point: the swing
// stops being a damage number and becomes a QUESTION - is that one under
// half. A wave of things the player has already shot once is a wave they can
// walk through, and a wave they have not is a wave where this does nothing at
// all.
//
// NOT BOSSES, and the refusal is absolute rather than scaled. EXECUTIONER
// sells half a boss's health for a piece of the player's own bar and LAST
// RITES is an item that finishes the nearly dead; a passive item that deleted
// a boss at half health for nothing would make both of them jokes.
//
// IT READS THE HEALTH BEFORE THE SWING, not after. A blow that took a body
// from 60% to 45% has not "found it under half" - the swing that arrived
// found it over half, and the damage it dealt is what it is worth.
export const id = 'throatCut';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'THROAT CUT',
    max: 1,
    theme: THEME.throatCut,
    effects: [['MELEE INSTANTLY KILLS', GOOD], ['ENEMIES UNDER 50% HP', NOTE], ['NOT BOSSES', BAD]],
    apply: (mods, n) => { mods.throatCut = 0.5 * n; },
}));

export const icon = [
  '........................',
  '........................',
  '....................42..',
  '...................422..',
  '..................422...',
  '...........221..4422....',
  '...........111.4422.....',
  '..............4432......',
  '.22222222222244332222221',
  '.22222222222333322222221',
  '.22000000003333222222221',
  '.22000000033332222222221',
  '.22000000333322222222221',
  '.22000003333222222222221',
  '.22000033330222222222221',
  '.22222333322222222222221',
  '.11123322111111111111111',
  '....4322................',
  '...4222....221..........',
  '..422......111..........',
  '.422....................',
  '.22.....................',
  '........................',
  '........................',
];
