import { definePassiveItem } from '../shared.js';

export const id = 'paceCar';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'PACE CAR',
    max: 1,
    theme: THEME.pace,
    // BERSERKER'S EXACT OPPOSITE, and it belongs in the same pool for that
    // reason. Berserker pays on health missing and is worth nothing until the
    // run is going badly; this is worth something for as long as the run is
    // going well and is gone the instant it is not - one graze, from anything,
    // and both halves switch off until the player has healed all the way back.
    //
    // TEN AND TEN, on the two stats a player FEELS rather than reads. It is a
    // small number twice on purpose: the pick is not the multiplier, it is
    // that being at full health has become a thing worth protecting.
    effects: [['AT FULL HEALTH:', NOTE], ['+10% FIRE RATE', GOOD], ['+10% MOVE SPEED', GOOD]],

    apply: (mods, n) => { mods.pace = 0.1 * n; },
}));

export const icon = [
  '..21....................',
  '..21....................',
  '..21..44440000044442....',
  '..21..43330000033332....',
  '..21..43330000033332....',
  '..21..43330000033332....',
  '..21..43330000033332....',
  '..21..00003333300000....',
  '..21..00003333300000....',
  '..21..00003333300000....',
  '..21..00003333300000....',
  '..21..00003333300000....',
  '..21..43330000033332....',
  '..21..43330000033332....',
  '..21..43330000033332....',
  '..21..43330000033332....',
  '..21..22220000032232....',
  '..21...........44.44....',
  '..21..........4444444...',
  '..21..........4444444...',
  '..21...........44444....',
  '..21............444.....',
  '..21.............4......',
  '..11....................',
];
