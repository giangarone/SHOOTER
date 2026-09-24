import { definePassiveItem } from '../shared.js';

// Nanoweave's opposite number: that one asks you to break contact and this
// one asks you to plant. They are not the same pick - a player who owns both
// still has to choose which one they are playing for in a given fight, and
// standing still in a room full of enemies is the harder half of that.
//
// COMBAT ONLY, for the reason every regeneration in the pool is: the wave
// break has no clock on it, and a heal that ticked there would be a full
// health bar you reached by standing in the shop.
export const id = 'digIn';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'DIG IN',
    max: 1,
    theme: 0x8d6e63,
    effects: [['STAND STILL 3s:', NOTE], ['REGEN 3 HP/s', GOOD], ['ANY HIT RESETS IT', BAD]],
    apply: (mods, n) => {
      mods.plantRegen = 3 * n;
      mods.plantDelay = 3;
    },
}));

export const icon = [
  '...........21...........',
  '.........211121.........',
  '.........11..21.........',
  '.........1.4441.........',
  '.........124311.........',
  '..........1221..........',
  '...........222..........',
  '....44444444334444442...',
  '....43333333333333332...',
  '....22222223322222222...',
  '...........432..........',
  '...........432..........',
  '...........432..........',
  '.21........432.......1..',
  '.2221......432.....2221.',
  '.22221.....432....22221.',
  '.111221....432...221111.',
  '.1..121....432...211..1.',
  '.....1221..432.2211.....',
  '......122222222211......',
  '.......1122222111.......',
  '.........111111.........',
  '........................',
  '........................',
];
