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
