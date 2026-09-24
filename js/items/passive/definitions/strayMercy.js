import { definePassiveItem } from '../shared.js';

// ONE SHOT IN TWENTY HELPS. Kept clear of BLOOD TRANSFUSION, the active item
// that spends the player's own bar to top the run up: this is not a
// transfusion at all, it is a round that arrived and did the wrong thing.
//
// It is EVASION's shape - a die rolled on the way in - with the outcome
// turned all the way round: a dodge is a hit that did not land, and this is
// a hit that landed on your side. Twenty health is more than most single
// blows in the game are worth, so the pick is a net gain against anything
// that shoots and nothing at all against anything that swings.
//
// PROJECTILES ONLY, which is the whole shape of it. A rusher's fist reaches
// the player through the ENEMY context and a bullet through the PROJECTILE
// one (see _projCtx), so the pick asks the player to let the gunners shoot
// at them and to stay off the rushers.
export const id = 'strayMercy';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'STRAY MERCY',
    max: 1,
    theme: THEME.strayMercy,
    effects: [['5% OF ENEMY SHOTS', NOTE], ['HEAL YOU 20 HP', GOOD], ['INSTEAD OF HURTING', NOTE]],
    apply: (mods, n) => { mods.strayMercy = 0.05 * n; mods.strayMercyHeal = 20; },
}));

export const icon = [
  '........................',
  '........................',
  '........................',
  '.................4442...',
  '.................4332...',
  '.................4332...',
  '.................4332...',
  '.................4332...',
  '.................4332...',
  '0022221......44444333442',
  '0022222221...43333333332',
  '00222222211..43333333332',
  '0022221111...43333333332',
  '0011111......22223332222',
  '.................4332...',
  '.................4332...',
  '.................4332...',
  '.................4332...',
  '.................4332...',
  '.................2222...',
  '........................',
  '........................',
  '........................',
  '........................',
];
