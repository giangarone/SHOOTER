import { definePassiveItem } from '../shared.js';

// THE RED END OF THE STAMINA BAR, WHICH NOTHING HAS EVER PAID FOR. It is the
// one meter in the game a player only ever sees as a punishment - the lockout
// that refuses the next sprint - and this makes the bottom of it the best the
// gun ever is. The line is the LOCKOUT's own (see Player.staminaLow), so the
// window the card describes is exactly the red the HUD draws.
export const id = 'runningOnFumes';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'RUNNING ON FUMES',
    max: 1,
    theme: 0xd84b20,
    effects: [['+100% DAMAGE,', GOOD], ['+50% FIRE RATE', GOOD], ['WHILE STAMINA IS RED', NOTE]],
    apply: (mods, n) => { mods.fumesDamage = 1.0 * n; mods.fumesRate = 0.5 * n; },
}));

export const icon = [
  '........................',
  '..4442..................',
  '.443332.................',
  '44333332................',
  '43333332................',
  '433333332...............',
  '4333333332..............',
  '233333332222222222222221',
  '.43333322222222222222221',
  '.23333300000000000000021',
  '.22333300000000000000021',
  '.22333300000000000000021',
  '.22333300000000000000021',
  '.22333300000000000000021',
  '.22333300000000000000021',
  '.22222222222222222222221',
  '.11111111111111111111111',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
];
