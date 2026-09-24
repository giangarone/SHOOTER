import { definePassiveItem } from '../shared.js';

// TEN SECONDS OFF THE TOP OF EVERY WAVE with no magazine to think about -
// no rounds spent, no reload, nothing to count. It pays the opening, which
// is the part of a wave the player has the most control over, and the -5%
// is charged for the whole rest of it.
//
// It says so on the HUD. A window that is silently open and silently shut
// is a stat the player can only infer from an ammo counter that stopped
// moving, so it wears a chip with a timer like every other window in the
// game - see setBuffs in ui.js.
export const id = 'openingSalvo';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'OPENING SALVO',
    max: 1,
    theme: THEME.salvo,
    effects: [['FIRST 10s OF EACH', NOTE], ['WAVE: SHOTS ARE FREE', GOOD], ['DAMAGE -5%', BAD]],
    apply: (mods, n) => {
      mods.salvoTime = 10 * n;
      mods.damage *= Math.pow(0.95, n);
    },
}));

export const icon = [
  '........................',
  '........................',
  '........................',
  '........................',
  '......4442..............',
  '.....22322..............',
  '....22222...............',
  '...122211...............',
  '....4211................',
  '...2211.......2.........',
  '.422......22422.........',
  '.22......22222..........',
  '........222221..........',
  '........222211..........',
  '........22111...........',
  '.......22.1.....4422....',
  '......22.......2232.....',
  '......2.......22222.....',
  '.............122211.....',
  '..............4211......',
  '............42211.......',
  '...........422.1........',
  '...........22...........',
  '........................',
];
