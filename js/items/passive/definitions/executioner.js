import { definePassiveItem } from '../shared.js';

export const id = 'executioner';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'EXECUTIONER',
    max: 1,
    theme: THEME.executioner,
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
