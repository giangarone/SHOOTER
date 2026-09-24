import { definePassiveItem } from '../shared.js';

export const id = 'executioner';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'EXECUTIONER',
    max: 1,
    theme: 0x880e4f,
    // THE ONE PASSIVE ITEM THAT STILL COSTS MAX HEALTH. It was the most
    // expensive pick on that row at 50, and it keeps that price now that
    // nothing else does - halving a boss is worth a permanent third of the
    // bar, and without the price it would be a free answer to the only fight
    // in the game that is meant to be a wall.
    //
    // Charged through mods.maxHpFlat rather than as a payment, because
    // rebuildMods() replays the owned list from fresh defaults after every pick:
    // a price paid once could not survive that, but a mod can.
    //
    // Worth nothing for four waves out of five, and it applies to bosses
    // spawned AFTER it is taken - one already standing keeps the health bar it
    // arrived with.
    effects: [['BOSSES SPAWN WITH', GOOD], ['50% LESS HEALTH', NOTE], ['YOUR MAX HP -50', BAD]],
    apply: (mods, n) => {
      mods.bossHpMult *= Math.pow(0.5, n);
      mods.maxHpFlat += 50 * n;
    },
}));

export const icon = [
  '........................',
  '...........221..........',
  '...........221..........',
  '..21.......221......21..',
  '..4321.....221....22232.',
  '..432221...221..2222232.',
  '..43222221.222222222232.',
  '..432222222222222222232.',
  '..432222222222222222232.',
  '..432222222222222222232.',
  '..432222222222222222232.',
  '..432222211222222222232.',
  '..43222111.221112222232.',
  '..432111...221..1112232.',
  '..4211.....221.....1132.',
  '..22.......221.......22.',
  '...........221..........',
  '...........221..........',
  '...........221..........',
  '...........221..........',
  '.........2222221........',
  '.........2222221........',
  '.........1122111........',
  '...........111..........',
];
